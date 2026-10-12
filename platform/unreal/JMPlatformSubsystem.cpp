// SAMPLE — see header. The logic is exercised by unreal/tests (stub harness); it has not been compiled inside Unreal itself.
#include "JMPlatformSubsystem.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonWriter.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "Misc/FileHelper.h"
#include "GameFramework/GeneralProjectSettings.h"
#include "Engine/GameInstance.h"

void UJMPlatformSubsystem::Initialize(FSubsystemCollectionBase& Collection) {
  Super::Initialize(Collection);
  FParse::Value(FCommandLine::Get(), TEXT("-JMToken="), Token);
  FParse::Value(FCommandLine::Get(), TEXT("-JMServer="), Server);
  FParse::Value(FCommandLine::Get(), TEXT("-JMGameVersion="), GameVersion);
  if (Server.IsEmpty()) Server = DefaultServerUrl;
  Server.RemoveFromEnd(TEXT("/"));
  // Version of the installed build. The launcher passes it; otherwise fall back to Project Settings > Description > Project Version
  // (keep that in step with the version you upload to the launcher, or players may be told to update when they don't need to).
  if (GameVersion.IsEmpty()) GameVersion = GetDefault<UGeneralProjectSettings>()->ProjectVersion;

  if (Token.IsEmpty()) UE_LOG(LogTemp, Log, TEXT("JMPlatform: no launcher token; running offline (stats will not sync)."));
  LoadCachedManifest();                       // offline play still knows which states exist
  FetchWorldManifest();                       // then ask the server what's new
  if (WorldPollSeconds > 0.f) StartWorldPolling(WorldPollSeconds);
}

void UJMPlatformSubsystem::Deinitialize() {
  StopWorldPolling();
  Super::Deinitialize();
}

/* ------------------------------------------------------------------------------------- stats & presence */

void UJMPlatformSubsystem::Send(const FString& Verb, const FString& Path, const TSharedRef<FJsonObject>& Body) {
  if (Token.IsEmpty() || Server.IsEmpty()) return;  // offline play is fine
  FString Json;
  auto W = TJsonWriterFactory<>::Create(&Json);
  FJsonSerializer::Serialize(Body, W);
  auto Req = FHttpModule::Get().CreateRequest();
  Req->SetURL(Server + Path);
  Req->SetVerb(Verb);
  Req->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
  Req->SetHeader(TEXT("Authorization"), TEXT("Bearer ") + Token);
  Req->SetContentAsString(Json);
  Req->OnProcessRequestComplete().BindLambda([Path](FHttpRequestPtr, FHttpResponsePtr Res, bool bOk) {
    if (!bOk || !Res.IsValid() || Res->GetResponseCode() >= 300)
      UE_LOG(LogTemp, Warning, TEXT("JMPlatform %s failed (%d)"), *Path, Res.IsValid() ? Res->GetResponseCode() : -1);
  });
  Req->ProcessRequest();
}

void UJMPlatformSubsystem::CheckInToPark(const FString& ParkSlug) {
  auto Body = MakeShared<FJsonObject>();
  Body->SetStringField(TEXT("park"), ParkSlug);
  Send(TEXT("POST"), TEXT("/api/game/checkin"), Body);
}

void UJMPlatformSubsystem::UploadStats(int32 Level, int32 Xp, int32 BestScore, int32 BestCombo, int32 PlaySeconds,
                                       const TArray<FJMTrick>& Tricks, const TArray<FJMParkScore>& ParkScores) {
  auto Root = MakeShared<FJsonObject>();
  Root->SetNumberField(TEXT("level"), Level);         Root->SetNumberField(TEXT("xp"), Xp);
  Root->SetNumberField(TEXT("bestScore"), BestScore); Root->SetNumberField(TEXT("bestCombo"), BestCombo);
  Root->SetNumberField(TEXT("playSeconds"), PlaySeconds);
  TArray<TSharedPtr<FJsonValue>> T, P;
  for (const FJMTrick& K : Tricks) {
    auto O = MakeShared<FJsonObject>(); O->SetStringField(TEXT("name"), K.Name);
    O->SetNumberField(TEXT("landed"), K.Landed); O->SetNumberField(TEXT("bestScore"), K.BestScore);
    T.Add(MakeShared<FJsonValueObject>(O));
  }
  for (const FJMParkScore& S : ParkScores) {
    auto O = MakeShared<FJsonObject>(); O->SetStringField(TEXT("park"), S.ParkSlug);
    O->SetNumberField(TEXT("bestScore"), S.BestScore); O->SetNumberField(TEXT("bestCombo"), S.BestCombo);
    P.Add(MakeShared<FJsonValueObject>(O));
  }
  Root->SetArrayField(TEXT("tricks"), T); Root->SetArrayField(TEXT("parkScores"), P);
  Send(TEXT("PUT"), TEXT("/api/game/stats"), Root);
}

/* ------------------------------------------------------------------------------------- open world */

int32 UJMPlatformSubsystem::CompareVersions(const FString& A, const FString& B) {
  auto Split = [](const FString& V, TArray<int32>& Out) {
    int32 Cur = 0; bool Have = false;
    for (int32 i = 0; i < V.Len(); ++i) {
      const TCHAR C = V[i];
      if (C >= '0' && C <= '9') { Cur = Cur * 10 + (C - '0'); Have = true; }
      else if (C == '.' || C == '-' || C == '+') { Out.Add(Cur); Cur = 0; Have = false; }
      // anything else (e.g. "beta") is ignored, like parseInt() || 0 in the launcher
    }
    if (Have || Out.Num() == 0) Out.Add(Cur);
  };
  TArray<int32> PA, PB; Split(A, PA); Split(B, PB);
  const int32 N = FMath::Max(PA.Num(), PB.Num());
  for (int32 i = 0; i < N; ++i) {
    const int32 D = (i < PA.Num() ? PA[i] : 0) - (i < PB.Num() ? PB[i] : 0);
    if (D != 0) return D;
  }
  return 0;
}

FString UJMPlatformSubsystem::CachePath() { return FPaths::ProjectSavedDir() / TEXT("JMWorldManifest.json"); }

bool UJMPlatformSubsystem::ParseManifest(const FString& Json, int32& OutRevision, bool& bOutChanged,
                                         TArray<FJMWorldRegion>& OutRegions, TArray<FJMWorldPark>& OutParks) {
  TSharedPtr<FJsonObject> Root;
  auto Reader = TJsonReaderFactory<>::Create(Json);
  if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return false;
  double Rev = 0;
  if (!Root->TryGetNumberField(TEXT("revision"), Rev)) return false;
  OutRevision = static_cast<int32>(Rev);
  bOutChanged = Root->HasField(TEXT("changed")) ? Root->GetBoolField(TEXT("changed")) : true;

  const TArray<TSharedPtr<FJsonValue>>* Arr = nullptr;
  if (Root->TryGetArrayField(TEXT("regions"), Arr) && Arr) {
    for (const TSharedPtr<FJsonValue>& V : *Arr) {
      const TSharedPtr<FJsonObject> O = V.IsValid() ? V->AsObject() : nullptr;
      if (!O.IsValid()) continue;
      FJMWorldRegion R;
      O->TryGetStringField(TEXT("code"), R.Code);        O->TryGetStringField(TEXT("name"), R.Name);
      O->TryGetStringField(TEXT("version"), R.Version);  O->TryGetStringField(TEXT("releasedAt"), R.ReleasedAt);
      if (!R.Code.IsEmpty()) OutRegions.Add(R);
    }
  }
  Arr = nullptr;
  if (Root->TryGetArrayField(TEXT("parks"), Arr) && Arr) {
    for (const TSharedPtr<FJsonValue>& V : *Arr) {
      const TSharedPtr<FJsonObject> O = V.IsValid() ? V->AsObject() : nullptr;
      if (!O.IsValid()) continue;
      FJMWorldPark P;
      O->TryGetStringField(TEXT("slug"), P.Slug);   O->TryGetStringField(TEXT("name"), P.Name);
      O->TryGetStringField(TEXT("city"), P.City);   O->TryGetStringField(TEXT("state"), P.State);
      O->TryGetNumberField(TEXT("lat"), P.Latitude); O->TryGetNumberField(TEXT("lng"), P.Longitude);
      if (!P.Slug.IsEmpty()) OutParks.Add(P);
    }
  }
  return true;
}

void UJMPlatformSubsystem::LoadCachedManifest() {
  FString Raw;
  if (!FFileHelper::LoadFileToString(Raw, *CachePath())) return;
  int32 Rev = 0; bool bChanged = true; TArray<FJMWorldRegion> R; TArray<FJMWorldPark> P;
  if (!ParseManifest(Raw, Rev, bChanged, R, P) || !bChanged) return;   // only full manifests are cached
  Revision = Rev; Regions = R; Parks = P;
}

void UJMPlatformSubsystem::FetchWorldManifest() {
  if (Server.IsEmpty() || bFetching) return;     // offline (cache still answers queries) or already asking
  bFetching = true;
  FString Url = Server + TEXT("/api/world/manifest");
  if (Revision > 0) Url += FString::Printf(TEXT("?since=%d"), Revision);   // "changed:false" if we're current
  auto Req = FHttpModule::Get().CreateRequest();
  Req->SetURL(Url);
  Req->SetVerb(TEXT("GET"));
  Req->SetTimeout(10.f);
  TWeakObjectPtr<UJMPlatformSubsystem> Weak(this);
  Req->OnProcessRequestComplete().BindLambda([Weak](FHttpRequestPtr, FHttpResponsePtr Res, bool bOk) {
    if (!Weak.IsValid()) return;
    Weak->HandleManifestResponse(bOk && Res.IsValid(), Res.IsValid() ? Res->GetResponseCode() : 0, Res.IsValid() ? Res->GetContentAsString() : FString());
  });
  Req->ProcessRequest();
}

void UJMPlatformSubsystem::HandleManifestResponse(bool bOk, int32 Code, const FString& Body) {
  bFetching = false;
  if (!bOk || Code < 200 || Code >= 300) { OnWorldFetchFailed.Broadcast(FString::Printf(TEXT("World manifest request failed (%d)"), Code)); return; }
  int32 Rev = 0; bool bChanged = true; TArray<FJMWorldRegion> R; TArray<FJMWorldPark> P;
  if (!ParseManifest(Body, Rev, bChanged, R, P)) { OnWorldFetchFailed.Broadcast(TEXT("World manifest was not valid JSON")); return; }
  if (!bChanged) return;                         // nothing new
  ApplyManifest(Body, Rev, R, P);
}

void UJMPlatformSubsystem::ApplyManifest(const FString& RawJson, int32 NewRevision, const TArray<FJMWorldRegion>& NewRegions, const TArray<FJMWorldPark>& NewParks) {
  // Which states are newly open (or have a newer version) compared with what we knew? Skip on the very first fetch (no baseline).
  TArray<FJMWorldRegion> Newly;
  if (Revision > 0) {
    for (const FJMWorldRegion& N : NewRegions) {
      const FJMWorldRegion* Old = FindRegion(N.Code);
      if (!Old || CompareVersions(N.Version, Old->Version) > 0) Newly.Add(N);
    }
  }
  Revision = NewRevision; Regions = NewRegions; Parks = NewParks;
  FFileHelper::SaveStringToFile(RawJson, *CachePath());   // so the next offline launch still knows the world
  OnWorldUpdated.Broadcast(Revision, Newly);
}

void UJMPlatformSubsystem::StartWorldPolling(float IntervalSeconds) {
  StopWorldPolling();
  if (IntervalSeconds < 30.f) IntervalSeconds = 30.f;   // be kind to the server
  if (UGameInstance* GI = GetGameInstance())
    GI->GetTimerManager().SetTimer(PollTimer, this, &UJMPlatformSubsystem::FetchWorldManifest, IntervalSeconds, true);
}
void UJMPlatformSubsystem::StopWorldPolling() {
  if (UGameInstance* GI = GetGameInstance()) GI->GetTimerManager().ClearTimer(PollTimer);
}

const FJMWorldRegion* UJMPlatformSubsystem::FindRegion(const FString& StateCode) const {
  for (const FJMWorldRegion& R : Regions) if (R.Code.Equals(StateCode, ESearchCase::IgnoreCase)) return &R;
  return nullptr;
}
bool UJMPlatformSubsystem::IsRegionReleased(const FString& StateCode) const { return FindRegion(StateCode) != nullptr; }
FString UJMPlatformSubsystem::GetRegionVersion(const FString& StateCode) const { const FJMWorldRegion* R = FindRegion(StateCode); return R ? R->Version : FString(); }
bool UJMPlatformSubsystem::IsRegionPlayable(const FString& StateCode) const {
  const FJMWorldRegion* R = FindRegion(StateCode);
  return R && CompareVersions(GameVersion, R->Version) >= 0;
}
bool UJMPlatformSubsystem::RegionNeedsUpdate(const FString& StateCode) const {
  const FJMWorldRegion* R = FindRegion(StateCode);
  return R && CompareVersions(GameVersion, R->Version) < 0;
}
TArray<FString> UJMPlatformSubsystem::GetPlayableRegionCodes() const {
  TArray<FString> Out; for (const FJMWorldRegion& R : Regions) if (IsRegionPlayable(R.Code)) Out.Add(R.Code); return Out;
}
TArray<FString> UJMPlatformSubsystem::GetRegionsNeedingUpdate() const {
  TArray<FString> Out; for (const FJMWorldRegion& R : Regions) if (RegionNeedsUpdate(R.Code)) Out.Add(R.Code); return Out;
}
TArray<FJMWorldPark> UJMPlatformSubsystem::GetParksInRegion(const FString& StateCode) const {
  TArray<FJMWorldPark> Out; for (const FJMWorldPark& P : Parks) if (P.State.Equals(StateCode, ESearchCase::IgnoreCase)) Out.Add(P); return Out;
}
bool UJMPlatformSubsystem::IsParkInGame(const FString& ParkSlug) const {
  for (const FJMWorldPark& P : Parks) if (P.Slug == ParkSlug) return true;
  return false;
}
FName UJMPlatformSubsystem::GetRegionLevelName(const FString& StateCode) const { return FName(*(RegionLevelPrefix + StateCode.ToUpper())); }
