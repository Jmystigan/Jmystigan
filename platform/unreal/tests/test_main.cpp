// Logic harness for JMPlatformSubsystem (see ue_stub.h for what is and isn't being tested).
// usage: harness <manifest1.json> <manifest2.json> <outDir>
#include "../JMPlatformSubsystem.h"
#include "../JMPlatformSubsystem.cpp"   // compile the sample as-is, in this translation unit
#include <filesystem>
#include <iostream>

static int fails = 0, checks = 0;
#define CHECK(c) do { ++checks; if (!(c)) { ++fails; std::cerr << "  FAIL line " << __LINE__ << ": " #c "\n"; } } while (0)
static FString ReadFile(const std::string& p) { FString s; FFileHelper::LoadFileToString(s, p.c_str()); return s; }
static std::vector<TSharedPtr<IHttpRequest>>& Sent() { return FHttpModule::Sent(); }
static void Reply(size_t idx, int code, const FString& body, bool ok = true) {
  auto req = Sent()[idx]; auto res = std::make_shared<FHttpResponse>(); res->Code = code; res->Body = body;
  req->Complete(req, TSharedPtr<FHttpResponse>(res), ok);
}
static void Reset(UGameInstance& gi, const std::string& cmd) { Sent().clear(); gi.TM = FTimerManager(); GCommandLine() = FString(cmd); }

int main(int argc, char** argv) {
  if (argc < 4) { std::cerr << "usage: harness manifest1 manifest2 outDir\n"; return 2; }
  const FString M1 = ReadFile(argv[1]), M2 = ReadFile(argv[2]); const std::string out = argv[3];
  std::filesystem::create_directories(out);
  GSavedDir() = FString(out);
  UGameInstance gi; GGameInstance() = &gi;
  FSubsystemCollectionBase coll;

  // ---------- version compare (must agree with launcher/core.js cmpVer)
  std::cout << "version compare\n";
  using S = UJMPlatformSubsystem;
  CHECK(S::CompareVersions("1.10.0", "1.9.9") > 0);   CHECK(S::CompareVersions("1.9.9", "1.10.0") < 0);
  CHECK(S::CompareVersions("1.0", "1.0.0") == 0);     CHECK(S::CompareVersions("1.2.0-beta", "1.2.0") == 0);
  CHECK(S::CompareVersions("2", "10") < 0);           CHECK(S::CompareVersions("", "0") == 0);   CHECK(S::CompareVersions("1.0.0.1", "1.0.0") > 0);

  // ---------- offline start (no server): nothing is requested, queries answer from (empty) knowledge
  std::cout << "offline start\n";
  std::filesystem::remove(out + "/JMWorldManifest.json");
  Reset(gi, "");
  { S s; s.Initialize(coll);
    CHECK(Sent().empty()); CHECK(!s.IsLinked()); CHECK(!s.IsRegionReleased("TX")); CHECK(!s.IsRegionPlayable("TX"));
    CHECK(s.GetWorldRevision() == 0); CHECK(s.GetGameVersion() == FString("1.0.0.0"));        // falls back to Project Version
    CHECK(s.GetRegionLevelName("tx") == FName("L_TX"));
    s.FetchWorldManifest(); CHECK(Sent().empty()); s.Deinitialize(); }

  // ---------- launched by the launcher: first fetch (full manifest), no 'since'
  std::cout << "first fetch\n";
  Reset(gi, "Game.exe -JMToken=tok123 -JMServer=https://example.test/ -JMGameVersion=1.0.0");
  S s; int broadcasts = 0, lastNewly = -1, lastRev = -1, failures = 0; FString lastFailure;
  s.OnWorldUpdated.AddLambda([&](int32 rev, const TArray<FJMWorldRegion>& n) { ++broadcasts; lastRev = rev; lastNewly = n.Num(); });
  s.OnWorldFetchFailed.AddLambda([&](const FString& why) { ++failures; lastFailure = why; });
  s.Initialize(coll);
  CHECK(s.IsLinked()); CHECK(s.GetGameVersion() == FString("1.0.0"));
  CHECK(Sent().size() == 1); CHECK(Sent()[0]->Verb == FString("GET"));
  CHECK(Sent()[0]->Url == FString("https://example.test/api/world/manifest"));            // trailing slash normalised, no ?since yet
  CHECK(Sent()[0]->Headers.count("Authorization") == 0);                                   // manifest is public: don't leak the token
  CHECK(gi.TM.timers.size() == 1 && gi.TM.timers[0].rate == 300.f && gi.TM.timers[0].loop);
  s.FetchWorldManifest(); CHECK(Sent().size() == 1);                                       // in-flight guard
  Reply(0, 200, M1);
  CHECK(broadcasts == 1); CHECK(lastNewly == 0);                                           // first fetch: no "newly opened" spam
  CHECK(s.GetWorldRevision() > 0); CHECK(lastRev == s.GetWorldRevision());
  CHECK(s.IsRegionReleased("TX")); CHECK(s.IsRegionReleased("tx")); CHECK(!s.IsRegionReleased("CA"));
  CHECK(s.GetRegionVersion("TX") == FString("1.0.0")); CHECK(s.IsRegionPlayable("TX")); CHECK(!s.RegionNeedsUpdate("TX"));
  CHECK(s.GetParksInRegion("TX").Num() == 2); CHECK(s.IsParkInGame("rail-yard-austin")); CHECK(!s.IsParkInGame("nope"));
  CHECK(s.GetParksInRegion("TX")[0].Latitude != 0.0);
  CHECK(s.GetPlayableRegionCodes().Num() == 1 && s.GetRegionsNeedingUpdate().Num() == 0);
  const int32 rev1 = s.GetWorldRevision();
  CHECK(std::filesystem::exists(out + "/JMWorldManifest.json"));                           // cached for offline play

  // ---------- poll tick: asks with ?since=<rev>; "changed:false" is silent
  std::cout << "poll: unchanged\n";
  gi.TM.timers[0].fire();
  CHECK(Sent().size() == 2); CHECK(Sent()[1]->Url == FString::Printf("https://example.test/api/world/manifest?since=%d", rev1));
  Reply(1, 200, FString::Printf("{\"revision\":%d,\"changed\":false}", rev1));
  CHECK(broadcasts == 1);

  // ---------- poll tick: a new state (CA 1.1.0) shipped, but this build is 1.0.0 -> needs update, not playable
  std::cout << "poll: new state released\n";
  gi.TM.timers[0].fire(); CHECK(Sent().size() == 3);
  Reply(2, 200, M2);
  CHECK(broadcasts == 2); CHECK(lastNewly == 1);                                           // exactly CA is newly open
  CHECK(s.IsRegionReleased("CA")); CHECK(!s.IsRegionPlayable("CA")); CHECK(s.RegionNeedsUpdate("CA"));
  CHECK(s.IsRegionPlayable("TX")); CHECK(s.GetRegionsNeedingUpdate().Num() == 1); CHECK(s.GetRegionsNeedingUpdate()[0] == FString("CA"));
  CHECK(s.GetWorldRevision() > rev1);

  // ---------- failures reset the guard so the next tick can try again
  std::cout << "failures\n";
  gi.TM.timers[0].fire(); CHECK(Sent().size() == 4);
  Reply(3, 0, "", false);               CHECK(failures == 1);
  gi.TM.timers[0].fire(); CHECK(Sent().size() == 5);
  Reply(4, 503, "oops");                CHECK(failures == 2); CHECK(lastFailure == FString("World manifest request failed (503)"));
  gi.TM.timers[0].fire(); CHECK(Sent().size() == 6);
  Reply(5, 200, "<html>not json</html>"); CHECK(failures == 3);
  CHECK(s.IsRegionReleased("CA"));                                                         // old knowledge survives bad responses

  // ---------- a newer build removes the update prompt (launcher passes the new version)
  std::cout << "after updating the game\n";
  s.Deinitialize(); CHECK(gi.TM.timers.empty());
  Reset(gi, "Game.exe -JMServer=https://example.test -JMGameVersion=1.1.0");
  { S s2; s2.Initialize(coll);                                                             // starts from the on-disk cache (offline-first)
    CHECK(s2.GetWorldRevision() > 0); CHECK(s2.IsRegionReleased("CA")); CHECK(s2.IsRegionPlayable("CA")); CHECK(s2.GetRegionsNeedingUpdate().Num() == 0);
    CHECK(Sent().size() == 1 && Sent()[0]->Url.s.find("?since=") != std::string::npos);    // and only asks "anything since?"
    CHECK(s2.GetPlayableRegionCodes().Num() == 2); s2.Deinitialize(); }

  // ---------- stats + check-in: right verb/path/auth, and bodies saved so the real server can be asked to accept them
  std::cout << "stats + check-in\n";
  Reset(gi, "Game.exe -JMToken=tok123 -JMServer=https://example.test -JMGameVersion=1.1.0");
  { S s3; s3.WorldPollSeconds = 0.f; s3.Initialize(coll); Sent().clear();
    TArray<FJMTrick> tricks; FJMTrick k; k.Name = "Kickflip"; k.Landed = 12; k.BestScore = 900; tricks.Add(k); k.Name = "Boardslide"; k.Landed = 3; k.BestScore = 400; tricks.Add(k);
    TArray<FJMParkScore> ps; FJMParkScore p; p.ParkSlug = "rail-yard-austin"; p.BestScore = 777; p.BestCombo = 31; ps.Add(p);
    s3.CheckInToPark("rail-yard-austin"); s3.UploadStats(7, 1200, 777, 31, 3600, tricks, ps);
    CHECK(Sent().size() == 2);
    CHECK(Sent()[0]->Verb == FString("POST") && Sent()[0]->Url == FString("https://example.test/api/game/checkin"));
    CHECK(Sent()[1]->Verb == FString("PUT") && Sent()[1]->Url == FString("https://example.test/api/game/stats"));
    for (auto& r : Sent()) { CHECK(r->Headers["Authorization"] == "Bearer tok123"); CHECK(r->Headers["Content-Type"] == "application/json"); }
    std::ofstream(out + "/captured_checkin.json") << Sent()[0]->Content.s; std::ofstream(out + "/captured_stats.json") << Sent()[1]->Content.s;
    CHECK(gi.TM.timers.empty()); }                                                         // WorldPollSeconds=0 -> no polling timer
  // without a token nothing is sent (offline play is fine)
  Reset(gi, "Game.exe -JMServer=https://example.test");
  { S s4; s4.WorldPollSeconds = 0.f; s4.Initialize(coll); Sent().clear(); s4.CheckInToPark("x"); TArray<FJMTrick> a; TArray<FJMParkScore> b; s4.UploadStats(1, 0, 0, 0, 0, a, b); CHECK(Sent().empty()); }

  std::cout << (fails ? "FAILED" : "all passed") << " (" << checks << " checks, " << fails << " failed)\n";
  return fails ? 1 : 0;
}
