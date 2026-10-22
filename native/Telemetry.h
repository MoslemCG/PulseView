#pragma once
#include "WinUtil.h"
#include <thread>
#include <mutex>
#include <condition_variable>
#include <functional>
#include <set>
#include <memory>
namespace pulse {
class Telemetry {
public:
 using Sink=std::function<void(Json)>;
 explicit Telemetry(Sink sink);~Telemetry();
 void Start();void Stop();void Configure(const Json&settings,const Json&metrics);
 void Pause(bool paused);void Reset();Json Diagnostics()const;
private:
 void Run();
 Sink sink_;std::thread thread_;mutable std::mutex mutex_;std::condition_variable cv_;
 bool stopping_=false,paused_=false,reset_=false;double seconds_=1;std::set<std::string> interests_;std::uint64_t revision_=0;
 Json diagnostics_=Json::object();
};
}
