// UNTESTED SAMPLE — drop into your Unreal project's Source/<YourGame>/ and add "HTTP", "Json"
// to PublicDependencyModuleNames in <YourGame>.Build.cs. Rename YOURGAME_API to match your module.
#pragma once
#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
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

/** Reads the launcher-provided token from the command line (-JMToken=... -JMServer=...) and talks to the platform. */
UCLASS()
class YOURGAME_API UJMPlatformSubsystem : public UGameInstanceSubsystem {
  GENERATED_BODY()
public:
  virtual void Initialize(FSubsystemCollectionBase& Collection) override;

  /** Call when the player loads into a scanned park so "who's here" shows them online. */
  UFUNCTION(BlueprintCallable, Category="JM Platform") void CheckInToPark(const FString& ParkSlug);

  /** Call at session end / on level-up. The server keeps the max of every best, so re-sending is safe. */
  UFUNCTION(BlueprintCallable, Category="JM Platform")
  void UploadStats(int32 Level, int32 Xp, int32 BestScore, int32 BestCombo, int32 PlaySeconds,
                   const TArray<FJMTrick>& Tricks, const TArray<FJMParkScore>& ParkScores);

  UFUNCTION(BlueprintPure, Category="JM Platform") bool IsLinked() const { return !Token.IsEmpty(); }
private:
  FString Token, Server;
  void Send(const FString& Verb, const FString& Path, const TSharedRef<FJsonObject>& Body);
};
