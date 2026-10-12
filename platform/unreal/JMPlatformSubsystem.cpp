// UNTESTED SAMPLE — see header.
#include "JMPlatformSubsystem.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonWriter.h"
#include "Serialization/JsonSerializer.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"

void UJMPlatformSubsystem::Initialize(FSubsystemCollectionBase& Collection) {
  Super::Initialize(Collection);
  FParse::Value(FCommandLine::Get(), TEXT("-JMToken="), Token);
  FParse::Value(FCommandLine::Get(), TEXT("-JMServer="), Server);
  if (Token.IsEmpty()) UE_LOG(LogTemp, Log, TEXT("JMPlatform: no launcher token; running offline (stats will not sync)."));
}

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
