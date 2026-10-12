// A *minimal* imitation of the Unreal APIs that JMPlatformSubsystem uses — just enough to compile it with g++ and run its logic.
// It mirrors how I believe the real APIs behave; it is NOT Unreal. Passing here means the logic and syntax are sound, not that
// it compiles in your UE version. Real compile + a Blueprint smoke test in-editor is still required.
#pragma once
#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <functional>
#include <map>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

using int32 = int; using int64 = long long; using TCHAR = char;
#define TEXT(x) x
#define UCLASS(...)
#define USTRUCT(...)
#define UPROPERTY(...)
#define UFUNCTION(...)
#define GENERATED_BODY() using Super = UGameInstanceSubsystem;
#define YOURGAME_API
#define UE_LOG(cat, verb, fmt, ...) std::fprintf(stderr, "[" #cat "] " fmt "\n", ##__VA_ARGS__)

enum class ESearchCase { CaseSensitive, IgnoreCase };
struct FString {
  std::string s;
  FString() {} FString(const char* c) : s(c ? c : "") {} FString(const std::string& x) : s(x) {}
  bool IsEmpty() const { return s.empty(); }
  int32 Len() const { return (int32)s.size(); }
  char operator[](int32 i) const { return s[i]; }
  const char* operator*() const { return s.c_str(); }
  FString operator+(const FString& o) const { return FString(s + o.s); }
  FString& operator+=(const FString& o) { s += o.s; return *this; }
  FString operator/(const FString& o) const { return FString(s + "/" + o.s); }
  bool operator==(const FString& o) const { return s == o.s; }
  bool operator!=(const FString& o) const { return s != o.s; }
  bool Equals(const FString& o, ESearchCase c = ESearchCase::CaseSensitive) const {
    if (c == ESearchCase::CaseSensitive) return s == o.s;
    return s.size() == o.s.size() && std::equal(s.begin(), s.end(), o.s.begin(), [](char a, char b) { return std::tolower(a) == std::tolower(b); });
  }
  FString ToUpper() const { std::string r = s; for (auto& c : r) c = (char)std::toupper(c); return r; }
  bool RemoveFromEnd(const char* suf) { std::string x = suf; if (s.size() >= x.size() && s.compare(s.size() - x.size(), x.size(), x) == 0) { s.resize(s.size() - x.size()); return true; } return false; }
  static FString Printf(const char* fmt, ...) { char b[2048]; va_list a; va_start(a, fmt); std::vsnprintf(b, sizeof b, fmt, a); va_end(a); return FString(b); }
};
inline FString operator+(const char* a, const FString& b) { return FString(a) + b; }
struct FName { std::string s; FName() {} FName(const char* c) : s(c) {} FString ToString() const { return s; } bool operator==(const FName& o) const { return s == o.s; } };
struct FMath { template <class T> static T Max(T a, T b) { return a > b ? a : b; } };

template <class T> struct TArray {
  std::vector<T> v;
  int32 Add(const T& x) { v.push_back(x); return (int32)v.size() - 1; }
  int32 Num() const { return (int32)v.size(); }
  T& operator[](int32 i) { return v[i]; } const T& operator[](int32 i) const { return v[i]; }
  void Empty() { v.clear(); }
  typename std::vector<T>::iterator begin() { return v.begin(); } typename std::vector<T>::iterator end() { return v.end(); }
  typename std::vector<T>::const_iterator begin() const { return v.begin(); } typename std::vector<T>::const_iterator end() const { return v.end(); }
};
template <class T> struct TSharedPtr : std::shared_ptr<T> {
  TSharedPtr() {} TSharedPtr(std::nullptr_t) {} TSharedPtr(std::shared_ptr<T> p) : std::shared_ptr<T>(p) {}
  template <class U> TSharedPtr(const TSharedPtr<U>& o) : std::shared_ptr<T>(o) {}
  bool IsValid() const { return (bool)*this; }
};
template <class T> struct TSharedRef : TSharedPtr<T> {
  TSharedRef(std::shared_ptr<T> p) : TSharedPtr<T>(p) {}
  template <class U> TSharedRef(const TSharedRef<U>& o) : TSharedPtr<T>(o) {}
};
template <class T, class... A> TSharedRef<T> MakeShared(A&&... a) { return TSharedRef<T>(std::make_shared<T>(std::forward<A>(a)...)); }
template <class T> struct TWeakObjectPtr { T* p = nullptr; TWeakObjectPtr(T* x) : p(x) {} bool IsValid() const { return p != nullptr; } T* operator->() const { return p; } };

// ---- delegates (dynamic multicast in UE; here: plain callbacks)
template <class F> struct TMulticast;
template <class... A> struct TMulticast<void(A...)> {
  std::vector<std::function<void(A...)>> L;
  void AddLambda(std::function<void(A...)> f) { L.push_back(f); }
  void Broadcast(A... a) const { for (auto& f : L) f(a...); }
};
#define DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(N, T1, N1) struct N : TMulticast<void(T1)> {}
#define DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(N, T1, N1, T2, N2) struct N : TMulticast<void(T1, T2)> {}

// ---- JSON
struct FJsonObject;
struct FJsonValue {
  enum Kind { Null, Bool, Num, Str, Arr, Obj } k = Null; bool b = false; double n = 0; FString s; TArray<TSharedPtr<FJsonValue>> a; TSharedPtr<FJsonObject> o;
  virtual ~FJsonValue() {}
  TSharedPtr<FJsonObject> AsObject() const { return k == Obj ? o : TSharedPtr<FJsonObject>(); }
};
struct FJsonObject {
  std::map<std::string, TSharedPtr<FJsonValue>> m;
  static TSharedPtr<FJsonValue> V(FJsonValue::Kind k) { auto v = std::make_shared<FJsonValue>(); v->k = k; return v; }
  void SetStringField(const FString& k, const FString& x) { auto v = V(FJsonValue::Str); v->s = x; m[k.s] = v; }
  void SetNumberField(const FString& k, double x) { auto v = V(FJsonValue::Num); v->n = x; m[k.s] = v; }
  void SetArrayField(const FString& k, const TArray<TSharedPtr<FJsonValue>>& x) { auto v = V(FJsonValue::Arr); v->a = x; m[k.s] = v; }
  bool HasField(const FString& k) const { return m.count(k.s) > 0; }
  bool GetBoolField(const FString& k) const { return m.at(k.s)->b; }
  bool TryGetNumberField(const FString& k, double& out) const { auto i = m.find(k.s); if (i == m.end() || i->second->k != FJsonValue::Num) return false; out = i->second->n; return true; }
  bool TryGetStringField(const FString& k, FString& out) const { auto i = m.find(k.s); if (i == m.end() || i->second->k != FJsonValue::Str) return false; out = i->second->s; return true; }
  bool TryGetArrayField(const FString& k, const TArray<TSharedPtr<FJsonValue>>*& out) const { auto i = m.find(k.s); if (i == m.end() || i->second->k != FJsonValue::Arr) return false; out = &i->second->a; return true; }
};
struct FJsonValueObject : FJsonValue { FJsonValueObject(TSharedPtr<FJsonObject> x) { k = Obj; o = x; } };
template <class = void> struct TJsonReader { FString text; };
template <class = void> struct TJsonWriter { FString* out; };
template <class = void> struct TJsonReaderFactory { static TSharedRef<TJsonReader<>> Create(const FString& t) { auto r = std::make_shared<TJsonReader<>>(); r->text = t; return TSharedRef<TJsonReader<>>(r); } };
template <class = void> struct TJsonWriterFactory { static TSharedRef<TJsonWriter<>> Create(FString* o) { auto w = std::make_shared<TJsonWriter<>>(); w->out = o; return TSharedRef<TJsonWriter<>>(w); } };

namespace jsonimpl {
struct P {
  const std::string& t; size_t i = 0; bool ok = true;
  void ws() { while (i < t.size() && std::isspace((unsigned char)t[i])) i++; }
  std::string str() { std::string r; i++; while (i < t.size() && t[i] != '"') { if (t[i] == '\\' && i + 1 < t.size()) { i++; char c = t[i]; r += c == 'n' ? '\n' : c == 't' ? '\t' : c == 'r' ? '\r' : c == 'u' ? (i += 4, '?') : c; } else r += t[i]; i++; } i++; return r; }
  TSharedPtr<FJsonValue> val() {
    ws(); if (i >= t.size()) { ok = false; return nullptr; }
    auto v = std::make_shared<FJsonValue>();
    if (t[i] == '{') { v->k = FJsonValue::Obj; v->o = std::make_shared<FJsonObject>(); i++; ws(); if (t[i] == '}') { i++; return v; }
      while (ok) { ws(); if (t[i] != '"') { ok = false; break; } std::string k = str(); ws(); if (t[i] != ':') { ok = false; break; } i++; v->o->m[k] = val(); ws(); if (t[i] == ',') { i++; continue; } if (t[i] == '}') { i++; break; } ok = false; } }
    else if (t[i] == '[') { v->k = FJsonValue::Arr; i++; ws(); if (t[i] == ']') { i++; return v; }
      while (ok) { v->a.Add(val()); ws(); if (t[i] == ',') { i++; continue; } if (t[i] == ']') { i++; break; } ok = false; } }
    else if (t[i] == '"') { v->k = FJsonValue::Str; v->s = str(); }
    else if (t.compare(i, 4, "true") == 0) { v->k = FJsonValue::Bool; v->b = true; i += 4; }
    else if (t.compare(i, 5, "false") == 0) { v->k = FJsonValue::Bool; i += 5; }
    else if (t.compare(i, 4, "null") == 0) { v->k = FJsonValue::Null; i += 4; }
    else { char* e; v->n = std::strtod(t.c_str() + i, &e); if (e == t.c_str() + i) ok = false; v->k = FJsonValue::Num; i = e - t.c_str(); }
    return v;
  }
};
inline void esc(std::string& o, const std::string& s) { o += '"'; for (char c : s) { if (c == '"' || c == '\\') { o += '\\'; o += c; } else if (c == '\n') o += "\\n"; else o += c; } o += '"'; }
inline void write(std::string& o, const FJsonValue& v);
inline void writeObj(std::string& o, const FJsonObject& ob) { o += '{'; bool f = true; for (auto& kv : ob.m) { if (!f) o += ','; f = false; esc(o, kv.first); o += ':'; write(o, *kv.second); } o += '}'; }
inline void write(std::string& o, const FJsonValue& v) {
  switch (v.k) {
    case FJsonValue::Str: esc(o, v.s.s); break;
    case FJsonValue::Num: { char b[64]; if (v.n == std::floor(v.n) && std::fabs(v.n) < 1e15) std::snprintf(b, sizeof b, "%lld", (long long)v.n); else std::snprintf(b, sizeof b, "%.17g", v.n); o += b; break; }
    case FJsonValue::Bool: o += v.b ? "true" : "false"; break;
    case FJsonValue::Arr: { o += '['; bool f = true; for (auto& x : v.a) { if (!f) o += ','; f = false; write(o, *x); } o += ']'; break; }
    case FJsonValue::Obj: writeObj(o, *v.o); break;
    default: o += "null";
  }
}
}
struct FJsonSerializer {
  static bool Deserialize(const TSharedRef<TJsonReader<>>& r, TSharedPtr<FJsonObject>& out) {
    jsonimpl::P p{r->text.s}; auto v = p.val(); if (!p.ok || !v || v->k != FJsonValue::Obj) return false; out = v->o; return true;
  }
  static bool Serialize(const TSharedRef<FJsonObject>& o, const TSharedRef<TJsonWriter<>>& w) { std::string s; jsonimpl::writeObj(s, *o); *w->out = FString(s); return true; }
};

// ---- HTTP (requests are recorded; tests deliver the responses)
struct IHttpRequest; struct FHttpResponse;
using FHttpRequestPtr = TSharedPtr<IHttpRequest>; using FHttpResponsePtr = TSharedPtr<FHttpResponse>;
struct FHttpResponse { int32 Code = 200; FString Body; int32 GetResponseCode() const { return Code; } FString GetContentAsString() const { return Body; } };
struct IHttpRequest : std::enable_shared_from_this<IHttpRequest> {
  FString Url, Verb, Content; std::map<std::string, std::string> Headers; float Timeout = 0; std::function<void(FHttpRequestPtr, FHttpResponsePtr, bool)> Complete;
  struct Del { IHttpRequest* r; void BindLambda(std::function<void(FHttpRequestPtr, FHttpResponsePtr, bool)> f) { r->Complete = f; } };
  Del OnProcessRequestComplete() { return Del{this}; }
  void SetURL(const FString& u) { Url = u; } void SetVerb(const FString& v) { Verb = v; } void SetTimeout(float t) { Timeout = t; }
  void SetHeader(const FString& k, const FString& v) { Headers[k.s] = v.s; } void SetContentAsString(const FString& c) { Content = c; }
  void ProcessRequest();
};
struct FHttpModule {
  static FHttpModule& Get() { static FHttpModule m; return m; }
  static std::vector<TSharedPtr<IHttpRequest>>& Sent() { static std::vector<TSharedPtr<IHttpRequest>> s; return s; }
  TSharedRef<IHttpRequest> CreateRequest() { return TSharedRef<IHttpRequest>(std::make_shared<IHttpRequest>()); }
};
inline void IHttpRequest::ProcessRequest() { FHttpModule::Sent().push_back(TSharedPtr<IHttpRequest>(shared_from_this())); }

// ---- engine services
struct FTimerHandle { int id = 0; };
struct FTimerManager {
  struct Rec { int id; float rate; bool loop; std::function<void()> fire; };
  std::vector<Rec> timers; int next = 0;
  template <class U, class M> void SetTimer(FTimerHandle& h, U* obj, M m, float rate, bool loop) { h.id = ++next; timers.push_back({h.id, rate, loop, [obj, m] { (obj->*m)(); }}); }
  void ClearTimer(FTimerHandle& h) { timers.erase(std::remove_if(timers.begin(), timers.end(), [&](const Rec& r) { return r.id == h.id; }), timers.end()); h.id = 0; }
};
struct UObject { virtual ~UObject() {} };
struct UGameInstance : UObject { FTimerManager TM; FTimerManager& GetTimerManager() { return TM; } };
inline UGameInstance*& GGameInstance() { static UGameInstance* g = nullptr; return g; }
struct FSubsystemCollectionBase {};
struct UGameInstanceSubsystem : UObject {
  virtual void Initialize(FSubsystemCollectionBase&) {} virtual void Deinitialize() {}
  UGameInstance* GetGameInstance() const { return GGameInstance(); }
};
struct UGeneralProjectSettings { FString ProjectVersion = "1.0.0.0"; };
template <class T> const T* GetDefault() { static T t; return &t; }
inline FString& GCommandLine() { static FString s; return s; }
inline FString& GSavedDir() { static FString s; return s; }
struct FCommandLine { static const FString& Get() { return GCommandLine(); } };
struct FParse { static bool Value(const FString& cmd, const char* key, FString& out) {
  size_t p = cmd.s.find(key); if (p == std::string::npos) return false; p += std::strlen(key); size_t e = cmd.s.find(' ', p); out = FString(cmd.s.substr(p, e == std::string::npos ? e : e - p)); return true; } };
struct FPaths { static FString ProjectSavedDir() { return GSavedDir(); } };
struct FFileHelper {
  static bool LoadFileToString(FString& out, const char* path) { std::ifstream f(path); if (!f) return false; std::stringstream b; b << f.rdbuf(); out = FString(b.str()); return true; }
  static bool SaveStringToFile(const FString& s, const char* path) { std::ofstream f(path); f << s.s; return (bool)f; }
};
