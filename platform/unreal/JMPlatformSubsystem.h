// SAMPLE — drop into your Unreal project's Source/<YourGame>/ and add "HTTP", "Json" to PublicDependencyModuleNames
// in <YourGame>.Build.cs (plus "Engine", which you already have). Rename YOURGAME_API to match your module.
// Not compiled inside Unreal yet; the logic is checked by unreal/tests (a stub-based harness) — see unreal/README.md.
#pragma once
#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "TimerManager.h"
#include "JMPlatformSubsystem.generated.h"

USTRUCT(BlueprintType) struct FJMTrick {
  GENERATED_BODY()
  UPROPERTY(BlueprintReadWrite, EditAnywhere) FString Name;
  UPROPERTY(BlueprintReadWrite, EditAnywhere) int32 Landed = 0;
  UPROPERTY(BlueprintReadWrite, EditAnywhere) int32 BestScore = 0;
};
USTRUCT(BlueprintType) struct FJMParkScore {
  GENERATED_BODY()
  UPROPERTY(BlueprintReadWrite, EditAnywhere) FString ParkSlug;   // must match the park's slug on the website
  UPROPERTY(BlueprintReadWrite, EditAnywhere) int32 BestScore = 0;
  UPROPERTY(BlueprintReadWrite, EditAnywhere) int32 BestCombo = 0;
};

/** A state ("open world" level) the developer has released. Code is the 2-letter state code, e.g. "TX". */
USTRUCT(BlueprintType) struct FJMWorldRegion {
  GENERATED_BODY()
  UPROPERTY(BlueprintReadOnly) FString Code;
  UPROPERTY(BlueprintReadOnly) FString Name;
  UPROPERTY(BlueprintReadOnly) FString Version;      // game version that shipped this state, e.g. "1.2.0"
  UPROPERTY(BlueprintReadOnly) FString ReleasedAt;
};
/** A skatepark that is in the game. Slug is the same id used by CheckInToPark / UploadStats. */
USTRUCT(BlueprintType) struct FJMWorldPark {
  GENERATED_BODY()
  UPROPERTY(BlueprintReadOnly) FString Slug;
  UPROPERTY(BlueprintReadOnly) FString Name;
  UPROPERTY(BlueprintReadOnly) FString City;
  UPROPERTY(BlueprintReadOnly) FString State;
  UPROPERTY(BlueprintReadOnly) double Latitude = 0.0;
  UPROPERTY(BlueprintReadOnly) double Longitude = 0.0;
};

/** Fired when the world changed. NewlyReleased lists states that just opened (empty on the very first fetch). */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FJMWorldUpdated, int32, Revision, const TArray<FJMWorldRegion>&, NewlyReleased);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FJMWorldFetchFailed, const FString&, Reason);

/**
 * Talks to the Blacktop Outlaws platform.
 *  - Launcher hand-off: -JMToken=<12h token> -JMServer=<https://...> -JMGameVersion=<installed version>
 *  - Stats / park check-in (needs the token)
 *  - World manifest (public): which states are released, which parks are in the game. Cached on disk so offline play still works.
 *
 * The manifest is a HINT for UI and level selection. It never tells the game to download or run anything;
 * new content only arrives through your launcher's normal game update.
 */
UCLASS(Config=Game)
class YOURGAME_API UJMPlatformSubsystem : public UGameInstanceSubsystem {
  GENERATED_BODY()
public:
  virtual void Initialize(FSubsystemCollectionBase& Collection) override;
  virtual void Deinitialize() override;

  /** Used when the game is started without the launcher (e.g. in the editor). Set in DefaultGame.ini:
   *  [/Script/YourGame.JMPlatformSubsystem]  DefaultServerUrl=https://your-domain.example */
  UPROPERTY(Config, EditAnywhere, BlueprintReadOnly, Category="JM Platform") FString DefaultServerUrl;
  /** Seconds between automatic manifest checks (0 = don't poll; call FetchWorldManifest yourself). */
  UPROPERTY(Config, EditAnywhere, BlueprintReadWrite, Category="JM Platform") float WorldPollSeconds = 300.f;
  /** Level naming convention: region "TX" streams level "L_TX". Change to match your project. */
  UPROPERTY(Config, EditAnywhere, BlueprintReadWrite, Category="JM Platform") FString RegionLevelPrefix = TEXT("L_");

  // ---- stats & presence (needs the launcher token)
  /** Call when the player loads into a scanned park so "who's here" shows them online. */
  UFUNCTION(BlueprintCallable, Category="JM Platform") void CheckInToPark(const FString& ParkSlug);

  /** Call at session end / on level-up. The server keeps the max of every best, so re-sending is safe. */
  UFUNCTION(BlueprintCallable, Category="JM Platform")
  void UploadStats(int32 Level, int32 Xp, int32 BestScore, int32 BestCombo, int32 PlaySeconds,
                   const TArray<FJMTrick>& Tricks, const TArray<FJMParkScore>& ParkScores);

  UFUNCTION(BlueprintPure, Category="JM Platform") bool IsLinked() const { return !Token.IsEmpty(); }

  // ---- open world
  /** Ask the server what changed since the last revision we saw. Safe to call any time; no-ops if a request is in flight. */
  UFUNCTION(BlueprintCallable, Category="JM Platform|World") void FetchWorldManifest();
  UFUNCTION(BlueprintCallable, Category="JM Platform|World") void StartWorldPolling(float IntervalSeconds = 300.f);
  UFUNCTION(BlueprintCallable, Category="JM Platform|World") void StopWorldPolling();

  /** Broadcast when the world changed (state released, park added, ...). Bind in Blueprint to show "Texas is now open!". */
  UPROPERTY(BlueprintAssignable, Category="JM Platform|World") FJMWorldUpdated OnWorldUpdated;
  UPROPERTY(BlueprintAssignable, Category="JM Platform|World") FJMWorldFetchFailed OnWorldFetchFailed;

  UFUNCTION(BlueprintPure, Category="JM Platform|World") int32 GetWorldRevision() const { return Revision; }
  UFUNCTION(BlueprintPure, Category="JM Platform|World") FString GetGameVersion() const { return GameVersion; }
  UFUNCTION(BlueprintPure, Category="JM Platform|World") TArray<FJMWorldRegion> GetReleasedRegions() const { return Regions; }
  UFUNCTION(BlueprintPure, Category="JM Platform|World") TArray<FJMWorldPark> GetParksInRegion(const FString& StateCode) const;
  UFUNCTION(BlueprintPure, Category="JM Platform|World") bool IsParkInGame(const FString& ParkSlug) const;
  /** Released on the server (whether or not this build contains it). */
  UFUNCTION(BlueprintPure, Category="JM Platform|World") bool IsRegionReleased(const FString& StateCode) const;
  UFUNCTION(BlueprintPure, Category="JM Platform|World") FString GetRegionVersion(const FString& StateCode) const;
  /** Released AND this installed build is new enough to contain it -> safe to stream/travel there. */
  UFUNCTION(BlueprintPure, Category="JM Platform|World") bool IsRegionPlayable(const FString& StateCode) const;
  /** Released, but the installed build is older than the release -> tell the player to update in the launcher. */
  UFUNCTION(BlueprintPure, Category="JM Platform|World") bool RegionNeedsUpdate(const FString& StateCode) const;
  UFUNCTION(BlueprintPure, Category="JM Platform|World") TArray<FString> GetPlayableRegionCodes() const;
  UFUNCTION(BlueprintPure, Category="JM Platform|World") TArray<FString> GetRegionsNeedingUpdate() const;
  /** "TX" -> "L_TX" (uses RegionLevelPrefix). Feed this to your level-streaming / OpenLevel call. */
  UFUNCTION(BlueprintPure, Category="JM Platform|World") FName GetRegionLevelName(const FString& StateCode) const;
  /** Dotted-number compare: <0 if A<B, 0 if equal, >0 if A>B ("1.10.0" > "1.9.9"; trailing zeros ignored; letters ignored). */
  UFUNCTION(BlueprintPure, Category="JM Platform|World") static int32 CompareVersions(const FString& A, const FString& B);

private:
  FString Token, Server, GameVersion;
  int32 Revision = 0;
  bool bFetching = false;
  TArray<FJMWorldRegion> Regions;
  TArray<FJMWorldPark> Parks;
  FTimerHandle PollTimer;

  void Send(const FString& Verb, const FString& Path, const TSharedRef<FJsonObject>& Body);
  static bool ParseManifest(const FString& Json, int32& OutRevision, bool& bOutChanged, TArray<FJMWorldRegion>& OutRegions, TArray<FJMWorldPark>& OutParks);
  void HandleManifestResponse(bool bOk, int32 Code, const FString& Body);
  void ApplyManifest(const FString& RawJson, int32 NewRevision, const TArray<FJMWorldRegion>& NewRegions, const TArray<FJMWorldPark>& NewParks);
  void LoadCachedManifest();
  static FString CachePath();
  const FJMWorldRegion* FindRegion(const FString& StateCode) const;
};
