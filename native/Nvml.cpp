#include "Nvml.h"
#include "TelemetryMath.h"
#include <array>
namespace pulse {
Nvml::Nvml(){
 std::array<wchar_t,32768> buffer{};std::vector<std::filesystem::path> paths;
 if(GetSystemDirectoryW(buffer.data(),static_cast<UINT>(buffer.size())))paths.emplace_back(std::filesystem::path(buffer.data())/L"nvml.dll");
 if(GetEnvironmentVariableW(L"ProgramW6432",buffer.data(),static_cast<DWORD>(buffer.size())))paths.emplace_back(std::filesystem::path(buffer.data())/L"NVIDIA Corporation"/L"NVSMI"/L"nvml.dll");
 for(const auto&p:paths){module_=LoadLibraryExW(p.c_str(),nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_SYSTEM32);if(module_)break;}if(!module_)return;
 const auto init=Proc<Init>("nvmlInit_v2");shutdown_=Proc<Init>("nvmlShutdown");const auto countFn=Proc<Count>("nvmlDeviceGetCount_v2");const auto handleFn=Proc<Handle>("nvmlDeviceGetHandleByIndex_v2");const auto nameFn=Proc<StringQuery>("nvmlDeviceGetName"),uuidFn=Proc<StringQuery>("nvmlDeviceGetUUID");
 if(!init||!shutdown_||!countFn||!handleFn||!nameFn||!uuidFn||init()!=0)return;initialized_=true;
 unsigned count=0;if(countFn(&count)!=0)return;
 for(unsigned i=0;i<std::min(count,32u);++i){void*handle=nullptr;char name[128]{},uuid[128]{};if(handleFn(i,&handle)!=0||nameFn(handle,name,sizeof(name))!=0||uuidFn(handle,uuid,sizeof(uuid))!=0)continue;devices_.push_back({handle,"nvidia.device."+StableHash(uuid),name});}
 utilization_=Proc<UtilQuery>("nvmlDeviceGetUtilizationRates");power_=Proc<UnsignedQuery>("nvmlDeviceGetPowerUsage");fan_=Proc<UnsignedQuery>("nvmlDeviceGetFanSpeed");temperature_=Proc<EnumQuery>("nvmlDeviceGetTemperature");clock_=Proc<EnumQuery>("nvmlDeviceGetClockInfo");encode_=Proc<CodecQuery>("nvmlDeviceGetEncoderUtilization");decode_=Proc<CodecQuery>("nvmlDeviceGetDecoderUtilization");
}
Nvml::~Nvml(){if(initialized_&&shutdown_)shutdown_();if(module_)FreeLibrary(module_);}
Json Nvml::Read(const Device&d)const{
 Json j={{"utilization",nullptr},{"memoryUtilization",nullptr},{"temperature",nullptr},{"power",nullptr},{"fan",nullptr},{"clock",nullptr},{"memoryClock",nullptr},{"encode",nullptr},{"decode",nullptr}};if(!initialized_)return j;
 Utilization util{};if(utilization_&&utilization_(d.handle,&util)==0){j["utilization"]=util.gpu;j["memoryUtilization"]=util.memory;}
 unsigned value=0,period=0;
 if(temperature_&&temperature_(d.handle,0,&value)==0)j["temperature"]=value;
 if(power_&&power_(d.handle,&value)==0)j["power"]=static_cast<double>(value)/1000;
 if(fan_&&fan_(d.handle,&value)==0)j["fan"]=value;
 if(clock_&&clock_(d.handle,0,&value)==0)j["clock"]=value;
 if(clock_&&clock_(d.handle,2,&value)==0)j["memoryClock"]=value;
 if(encode_&&encode_(d.handle,&value,&period)==0)j["encode"]=value;
 if(decode_&&decode_(d.handle,&value,&period)==0)j["decode"]=value;
 return j;
}
}
