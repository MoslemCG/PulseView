#pragma once
#include "WinUtil.h"
#include <vector>
namespace pulse {
// Minimal read-only ABI declarations, not a copy of NVIDIA's SDK header.
// NVML is loaded from its vendor/system installation. No driver is installed.
class Nvml {
public:
 struct Device {void* handle=nullptr;std::string id,name;};
 Nvml();~Nvml();Nvml(const Nvml&)=delete;Nvml&operator=(const Nvml&)=delete;
 bool Available()const{return initialized_;}
 const std::vector<Device>& Devices()const{return devices_;}
 Json Read(const Device&device)const;
private:
 HMODULE module_=nullptr;bool initialized_=false;std::vector<Device> devices_;
 using Init=int(__cdecl*)();using Count=int(__cdecl*)(unsigned*);using Handle=int(__cdecl*)(unsigned,void**);using StringQuery=int(__cdecl*)(void*,char*,unsigned);
 using UnsignedQuery=int(__cdecl*)(void*,unsigned*);using EnumQuery=int(__cdecl*)(void*,unsigned,unsigned*);using CodecQuery=int(__cdecl*)(void*,unsigned*,unsigned*);
 struct Utilization{unsigned gpu,memory;};using UtilQuery=int(__cdecl*)(void*,Utilization*);
 Init shutdown_=nullptr;UtilQuery utilization_=nullptr;UnsignedQuery power_=nullptr,fan_=nullptr;EnumQuery temperature_=nullptr,clock_=nullptr;CodecQuery encode_=nullptr,decode_=nullptr;
 template<class T>T Proc(const char*name)const{return reinterpret_cast<T>(GetProcAddress(module_,name));}
};
}
