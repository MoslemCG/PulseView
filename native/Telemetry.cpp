#include <winsock2.h>
#include <ws2tcpip.h>
#include "Telemetry.h"
#include "PdhQuery.h"
#include "Nvml.h"
#include "TelemetryMath.h"
#include "MetricDefinitions.h"
#include <iphlpapi.h>
#include <netioapi.h>
#include <psapi.h>
#include <dxgi1_2.h>
#include <wrl.h>
#include <array>
#include <algorithm>
#include <cctype>
#include <cmath>
#include <optional>
#include <vector>
#include <regex>
#include <sstream>
#include <iomanip>
#include <chrono>
#include <unordered_map>
#include <limits>

namespace pulse {
using Microsoft::WRL::ComPtr;
namespace {
using Clock=std::chrono::steady_clock;
struct GpuDevice{std::string id,name;std::uint64_t luid=0,vram=0,shared=0;};
struct Engine{std::string gpuId,type,label,metric;unsigned phys=0,index=0;};
struct NetPrevious{std::uint64_t in=0,out=0;Clock::time_point time;};
std::string Hex(std::uint64_t x){std::ostringstream s;s<<std::hex<<x;return s.str();}
std::string Lower(std::string s){std::transform(s.begin(),s.end(),s.begin(),[](unsigned char c){return static_cast<char>(std::tolower(c));});return s;}
std::string CpuName(){wchar_t name[256]{};DWORD size=sizeof(name);if(RegGetValueW(HKEY_LOCAL_MACHINE,L"HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0",L"ProcessorNameString",RRF_RT_REG_SZ,nullptr,name,&size)==ERROR_SUCCESS){std::string s=Utf8(name);const auto pos=s.find_last_not_of(' ');if(pos!=std::string::npos)s.resize(pos+1);return s;}return "CPU";}
unsigned PhysicalCores(){DWORD size=0;GetLogicalProcessorInformationEx(RelationProcessorCore,nullptr,&size);if(!size)return 0;std::vector<unsigned char>b(size);if(!GetLogicalProcessorInformationEx(RelationProcessorCore,reinterpret_cast<PSYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX>(b.data()),&size))return 0;unsigned result=0;for(DWORD offset=0;offset<size;){const auto*p=reinterpret_cast<PSYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX>(b.data()+offset);if(!p->Size)break;if(p->Relationship==RelationProcessorCore)++result;offset+=p->Size;}return result;}
std::uint64_t LuidValue(LUID luid){return(static_cast<std::uint64_t>(static_cast<std::uint32_t>(luid.HighPart))<<32)|luid.LowPart;}
std::uint64_t DefaultRouteLuid(){
 std::uint64_t selected=0;ULONG64 score=std::numeric_limits<ULONG64>::max();
 for(const ADDRESS_FAMILY family:{static_cast<ADDRESS_FAMILY>(AF_INET),static_cast<ADDRESS_FAMILY>(AF_INET6)}){
  PMIB_IPFORWARD_TABLE2 table=nullptr;if(GetIpForwardTable2(family,&table)!=NO_ERROR)continue;
  for(ULONG i=0;i<table->NumEntries;++i){const auto&r=table->Table[i];if(r.DestinationPrefix.PrefixLength!=0||r.Loopback)continue;MIB_IPINTERFACE_ROW intf{};InitializeIpInterfaceEntry(&intf);intf.Family=family;intf.InterfaceLuid=r.InterfaceLuid;if(GetIpInterfaceEntry(&intf)!=NO_ERROR||!intf.Connected)continue;const ULONG64 total=static_cast<ULONG64>(r.Metric)+intf.Metric;if(total<score){score=total;selected=r.InterfaceLuid.Value;}}
  FreeMibTable(table);if(selected)break;
 }return selected;
}
class Collector {
public:
 Collector(){
  for(auto&d:Json::parse(kMetricDefinitions))definitions_[d["id"].get<std::string>()]=d;
  system_["cpu"]=CpuName();system_["physicalCores"]=PhysicalCores();system_["logicalProcessors"]=GetActiveProcessorCount(ALL_PROCESSOR_GROUPS);
  InitCounters();DiscoverGpu();InitCpuDefinitions();Json initial=Json::object();ReadMemory(initial);
  for(auto&[id,d]:definitions_){if(id.rfind("nvidia.",0)==0){d["source"]="NVIDIA NVML (read-only)";d["available"]=nvml_.Available();d["reason"]=nvml_.Available()?"Waiting for first sample":"NVML not installed, not supported, or no NVIDIA GPU";}}
 }
 Json Collect(const std::set<std::string>&interests,double interval,bool forceAll){
  const auto start=Clock::now();const double elapsed=last_.time_since_epoch().count()?std::chrono::duration<double>(start-last_).count():0;last_=start;
  auto requested=[&](const std::string&prefix){if(forceAll||interests.empty())return true;return std::any_of(interests.begin(),interests.end(),[&](const std::string&id){return id.rfind(prefix,0)==0;});};
  const bool c=requested("cpu."),m=requested("memory."),g=requested("gpu."),n=requested("net."),d=requested("disk."),nv=requested("nvidia.");
  Json values=Json::object();
  // Emit null for missing samples in active groups. Stale last values are never presented as current.
  for(const auto&[id,def]:definitions_){(void)def;if((c&&id.rfind("cpu.",0)==0)||(m&&id.rfind("memory.",0)==0)||(g&&id.rfind("gpu.",0)==0)||(n&&id.rfind("net.",0)==0)||(d&&id.rfind("disk.",0)==0)||(nv&&id.rfind("nvidia.",0)==0))values[id]=nullptr;}
  if(c){cpu_.Collect();ReadCpu(values);}else cpu_.ResetBaseline();
  if(m)ReadMemory(values);
  if(g){if(start-lastDiscovery_>std::chrono::seconds(20)){DiscoverGpu();lastDiscovery_=start;}gpu_.Collect();ReadGpu(values);}else gpu_.ResetBaseline();
  if(n)ReadNetwork(values,start);else netPrevious_.clear();
  if(d){disk_.Collect();ReadDisks(values);}else disk_.ResetBaseline();
  if(nv)ReadNvidia(values);
  const auto timestamp=std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
  Json packet={{"metrics",{{"timestamp",timestamp},{"values",std::move(values)},{"elapsedSeconds",elapsed}}}};
  Json defs=Json::array();for(const auto&[id,def]:definitions_){(void)id;defs.push_back(def);}const auto signature=defs.dump()+system_.dump();
  if(signature!=lastSignature_){lastSignature_=signature;packet["catalog"]={{"metrics",std::move(defs)},{"system",system_},{"diagnostics",notes_}};}
  diagnostics_={{"providers",{{"cpuCounters",cpu_.Has("cores")},{"gpuEngines",gpu_.Has("engines")},{"gpuMemory",gpu_.Has("dedicated")},{"diskCounters",disk_.Has("read")},{"nvmlLoaded",nvml_.Available()}}},{"gpuAdapters",gpus_.size()},{"knownGpuEngines",engines_.size()},{"metricCount",definitions_.size()},{"requestedMetrics",interests.size()},{"refreshSeconds",interval},{"sampleWorkMs",std::chrono::duration<double,std::milli>(Clock::now()-start).count()},{"system",system_},{"notes",notes_}};
  return packet;
 }
 void Reset(){cpu_.ResetBaseline();gpu_.ResetBaseline();disk_.ResetBaseline();netPrevious_.clear();last_={};}
 Json Diagnostics()const{return diagnostics_;}
private:
 PdhQuery cpu_,gpu_,disk_;Nvml nvml_;std::map<std::string,Json>definitions_;Json system_=Json::object(),notes_=Json::array(),diagnostics_=Json::object();
 std::vector<GpuDevice>gpus_;std::map<std::string,Engine>engines_;std::map<std::uint64_t,NetPrevious>netPrevious_;std::string primaryGpu_,lastSignature_;Clock::time_point last_{},lastDiscovery_{};
 void Set(const std::string&id,const Json&v,Json&values){values[id]=v;}
 void Set(const std::string&id,const std::optional<double>&v,Json&values){if(v&&std::isfinite(*v))values[id]=*v;else values[id]=nullptr;}
 void Availability(const std::string&id,bool available,const std::string&reason="") {auto it=definitions_.find(id);if(it!=definitions_.end()){it->second["available"]=available;it->second["reason"]=reason;}}
 void Definition(const std::string&id,const std::string&label,const std::string&category,const std::string&unit,const std::string&color,const std::string&device,const std::string&source,bool available=true,Json max=nullptr,const std::string&group=""){
  definitions_[id]={{"id",id},{"label",label},{"category",category},{"unit",unit},{"color",color},{"device",device},{"source",source},{"available",available},{"reason",available?"":"Unavailable on this device"},{"max",max},{"group",group}};
 }
 void DeviceAlias(const std::string&id,const std::string&device,Json max=nullptr){if(definitions_.contains(id)){definitions_[id]["device"]=device;if(!max.is_null())definitions_[id]["max"]=max;}}
 void InitCounters(){
  cpu_.Add("total",L"\\Processor Information(_Total)\\% Processor Time");cpu_.Add("cores",L"\\Processor Information(*)\\% Processor Time");cpu_.Add("utility",L"\\Processor Information(_Total)\\% Processor Utility");cpu_.Add("frequency",L"\\Processor Information(_Total)\\Processor Frequency");
  gpu_.Add("engines",L"\\GPU Engine(*)\\Utilization Percentage");gpu_.Add("dedicated",L"\\GPU Adapter Memory(*)\\Dedicated Usage");gpu_.Add("shared",L"\\GPU Adapter Memory(*)\\Shared Usage");
  disk_.Add("read",L"\\PhysicalDisk(*)\\Disk Read Bytes/sec");disk_.Add("write",L"\\PhysicalDisk(*)\\Disk Write Bytes/sec");disk_.Add("idle",L"\\PhysicalDisk(*)\\% Idle Time");disk_.Add("latency",L"\\PhysicalDisk(*)\\Avg. Disk sec/Transfer");disk_.Add("queue",L"\\PhysicalDisk(*)\\Current Disk Queue Length");disk_.Add("readIops",L"\\PhysicalDisk(*)\\Disk Reads/sec");disk_.Add("writeIops",L"\\PhysicalDisk(*)\\Disk Writes/sec");
  if(!gpu_.Has("engines"))notes_.push_back("GPU Engine performance counters unavailable. WDDM GPU utilization will show unavailable.");
  notes_.push_back("Compute is not an isolated CUDA percentage. A CUDA widget requires a driver-exposed CUDA-named engine.");
  notes_.push_back("Memory counters are whole-adapter WDDM counters; QueryVideoMemoryInfo is intentionally not used for global VRAM.");
  notes_.push_back("Network counters include all traffic on the chosen default-route interface, not only Internet traffic.");
 }
 void InitCpuDefinitions(){
  for(const auto*id:{"cpu.usage","cpu.utility","cpu.frequency"})DeviceAlias(id,system_["cpu"].get<std::string>());
  Availability("cpu.usage",cpu_.Has("total"),cpu_.Has("total")?"":"Processor Time counter unavailable");Availability("cpu.utility",cpu_.Has("utility"),cpu_.Has("utility")?"":"Processor Utility counter unavailable");Availability("cpu.frequency",cpu_.Has("frequency"),cpu_.Has("frequency")?"":"Frequency counter unavailable");
  // Frequency-aware utility may exceed 100; do not force its graph to clip at 100.
  definitions_["cpu.utility"]["max"]=nullptr;
  const WORD groups=GetActiveProcessorGroupCount();for(WORD group=0;group<groups;++group){const DWORD count=GetActiveProcessorCount(group);for(DWORD index=0;index<count;++index){const auto id="cpu.logical."+std::to_string(group)+"."+std::to_string(index);Definition(id,"Logical processor "+std::to_string(group)+":"+std::to_string(index),"CPU","%","cpu",system_["cpu"],"PDH Processor Information: group,index; Processor Time",cpu_.Has("cores"),100,"logical");}}
 }
 void ReadCpu(Json&v){Set("cpu.usage",cpu_.Value("total"),v);Set("cpu.utility",cpu_.Value("utility"),v);Set("cpu.frequency",cpu_.Value("frequency"),v);const auto arr=cpu_.Array("cores");static const std::wregex pattern(LR"(^(\d+),(\d+)$)");if(arr.valid)for(const auto&[name,value]:arr.values){std::wsmatch m;if(std::regex_match(name,m,pattern))v["cpu.logical."+Utf8(m[1].str())+"."+Utf8(m[2].str())]=std::clamp(value,0.0,100.0);}}
 void ReadMemory(Json&v){
  MEMORYSTATUSEX m{};m.dwLength=sizeof(m);if(GlobalMemoryStatusEx(&m)){
   const auto used=m.ullTotalPhys-m.ullAvailPhys;v["memory.total"]=m.ullTotalPhys;v["memory.used"]=used;v["memory.available"]=m.ullAvailPhys;v["memory.percent"]=Percent(static_cast<double>(used),static_cast<double>(m.ullTotalPhys));system_["memory"]=m.ullTotalPhys;
   for(const auto*id:{"memory.total","memory.used","memory.available","memory.percent"}){Availability(id,true);DeviceAlias(id,"System physical memory");}DeviceAlias("memory.used","System physical memory",m.ullTotalPhys);DeviceAlias("memory.available","System physical memory",m.ullTotalPhys);
  }
  PERFORMANCE_INFORMATION p{};p.cb=sizeof(p);if(GetPerformanceInfo(&p,sizeof(p))){const auto page=static_cast<std::uint64_t>(p.PageSize);v["memory.commit"]=static_cast<std::uint64_t>(p.CommitTotal)*page;v["memory.commitLimit"]=static_cast<std::uint64_t>(p.CommitLimit)*page;v["memory.commitPercent"]=Percent(static_cast<double>(p.CommitTotal),static_cast<double>(p.CommitLimit));v["memory.cache"]=static_cast<std::uint64_t>(p.SystemCache)*page;v["memory.paged"]=static_cast<std::uint64_t>(p.KernelPaged)*page;v["memory.nonpaged"]=static_cast<std::uint64_t>(p.KernelNonpaged)*page;for(const auto*id:{"memory.commit","memory.commitLimit","memory.commitPercent","memory.cache","memory.paged","memory.nonpaged"})Availability(id,true);DeviceAlias("memory.commit","System commit",static_cast<std::uint64_t>(p.CommitLimit)*page);}
 }
 void DiscoverGpu(){
  ComPtr<IDXGIFactory1>factory;if(FAILED(CreateDXGIFactory1(IID_PPV_ARGS(&factory))))return;
  std::vector<GpuDevice> next;std::map<std::string,unsigned>duplicates;
  for(UINT i=0;;++i){ComPtr<IDXGIAdapter1>a;const HRESULT hr=factory->EnumAdapters1(i,&a);if(hr==DXGI_ERROR_NOT_FOUND)break;if(FAILED(hr))break;DXGI_ADAPTER_DESC1 desc{};if(FAILED(a->GetDesc1(&desc))||(desc.Flags&DXGI_ADAPTER_FLAG_SOFTWARE))continue;
   const auto key=Hex(desc.VendorId)+"-"+Hex(desc.DeviceId)+"-"+Hex(desc.SubSysId)+"-"+Hex(desc.Revision);const auto occurrence=duplicates[key]++;
   GpuDevice gpu{"gpu.device."+key+"-"+std::to_string(occurrence),Utf8(desc.Description),LuidValue(desc.AdapterLuid),desc.DedicatedVideoMemory,desc.SharedSystemMemory};next.push_back(gpu);
  }
  if(next.empty()){for(auto&[id,def]:definitions_)if(id.rfind("gpu.",0)==0){def["available"]=false;def["reason"]="No hardware GPU adapter found";}gpus_.clear();primaryGpu_.clear();return;}
  gpus_=std::move(next);const auto it=std::max_element(gpus_.begin(),gpus_.end(),[](const auto&a,const auto&b){return a.vram<b.vram;});primaryGpu_=it->id;system_["gpu"]=it->name;
  std::vector<Json> aliases;for(const auto&[id,def]:definitions_)if(id.rfind("gpu.",0)==0&&id.rfind("gpu.device.",0)!=0)aliases.push_back(def);
  for(const auto&g:gpus_)for(const auto&alias:aliases){const auto suffix=alias["id"].get<std::string>().substr(4);auto d=alias;const auto id=g.id+"."+suffix;d["id"]=id;d["device"]=g.name;d["label"]=alias["label"];d["available"]=suffix=="vram.total"||suffix=="shared.total";d["reason"]=d["available"].get<bool>()?"":"Waiting for driver counters";
   if(suffix=="vram.used"||suffix=="vram.free")d["max"]=g.vram;if(suffix=="shared.used")d["max"]=g.shared;
   // Preserve discovered availability; descriptor identity is adapter hardware tuple, not boot-local LUID.
   if(definitions_.contains(id)){d["available"]=definitions_[id]["available"];d["reason"]=definitions_[id]["reason"];}definitions_[id]=d;
  }
  for(auto&[id,def]:definitions_)if(id.rfind("gpu.",0)==0&&id.rfind("gpu.device.",0)!=0){def["device"]=it->name;if(id=="gpu.vram.used"||id=="gpu.vram.free")def["max"]=it->vram;if(id=="gpu.shared.used")def["max"]=it->shared;}
 }
 void ReadGpu(Json&v){
  static const std::wregex enginePattern(LR"(luid_0x([0-9a-fA-F]+)_0x([0-9a-fA-F]+)_phys_(\d+)_eng_(\d+)_engtype_(.+))");
  static const std::wregex memoryPattern(LR"(luid_0x([0-9a-fA-F]+)_0x([0-9a-fA-F]+)_phys_(\d+))");
  auto findGpu=[&](std::uint64_t luid)->const GpuDevice*{for(const auto&g:gpus_)if(g.luid==luid)return&g;return nullptr;};
  const auto arr=gpu_.Array("engines"),dedicated=gpu_.Array("dedicated"),shared=gpu_.Array("shared");std::map<std::string,double>aggregated;
  if(arr.valid)for(const auto&[instance,value]:arr.values){std::wsmatch m;if(!std::regex_search(instance,m,enginePattern))continue;
   const auto luid=(std::stoull(m[1].str(),nullptr,16)<<32)|std::stoull(m[2].str(),nullptr,16);const auto*g=findGpu(luid);if(!g)continue;
   const unsigned phys=static_cast<unsigned>(std::stoul(m[3].str())),index=static_cast<unsigned>(std::stoul(m[4].str()));const auto type=Utf8(m[5].str());const std::string key=g->id+"."+std::to_string(phys)+"."+std::to_string(index);aggregated[key]+=std::max(0.0,value);
   if(!engines_.contains(key)){
    Engine e{g->id,Lower(type),type,g->id+".engine."+std::to_string(phys)+"."+std::to_string(index),phys,index};engines_[key]=e;Definition(e.metric,"Engine "+type+" #"+std::to_string(index),"GPU","%",e.type.find("copy")!=std::string::npos?"copy":"gpu",g->name,"WDDM PDH: process contributions aggregated by adapter/physical-index/engine-index",true,100);
   }
  }
  auto memorySum=[&](const CounterArray&input){std::map<std::string,double>sums;if(input.valid)for(const auto&[instance,value]:input.values){std::wsmatch m;if(!std::regex_search(instance,m,memoryPattern))continue;const auto luid=(std::stoull(m[1].str(),nullptr,16)<<32)|std::stoull(m[2].str(),nullptr,16);const auto*g=findGpu(luid);if(g)sums[g->id]+=std::max(0.0,value);}return sums;};const auto ds=memorySum(dedicated),ss=memorySum(shared);
  for(const auto&g:gpus_){
   std::map<std::string,double>categories;bool hasEngines=false;
   for(const auto&[key,e]:engines_)if(e.gpuId==g.id){hasEngines=true;const double use=std::clamp(aggregated[key],0.0,100.0);if(arr.valid)v[e.metric]=use;else v[e.metric]=nullptr;
    std::string category;if(e.type=="3d")category="3d";else if(e.type.find("cuda")!=std::string::npos)category="cuda";else if(e.type.find("compute")!=std::string::npos)category="compute";else if(e.type.find("copy")!=std::string::npos)category="copy";else if(e.type.find("videoencode")!=std::string::npos)category="encode";else if(e.type.find("videodecode")!=std::string::npos)category="decode";else if(e.type.find("videoprocessing")!=std::string::npos)category="videoProcessing";
    if(!category.empty())categories[category]=std::max(categories[category],use);if(category=="cuda")categories["compute"]=std::max(categories["compute"],use);categories["total"]=std::max(categories["total"],use);
   }
   for(const auto*type:{"total","3d","compute","cuda","copy","encode","decode","videoProcessing"}){const auto id=g.id+"."+type;const bool known=hasEngines&&categories.contains(type);Availability(id,known,known?"":"Driver has not exposed this engine type");if(known&&arr.valid)v[id]=categories[type];else v[id]=nullptr;}
   v[g.id+".vram.total"]=g.vram;v[g.id+".shared.total"]=g.shared;Availability(g.id+".vram.total",true);Availability(g.id+".shared.total",true);
   if(ds.contains(g.id)){const double used=ds.at(g.id);v[g.id+".vram.used"]=used;v[g.id+".vram.free"]=std::max(0.0,static_cast<double>(g.vram)-used);if(g.vram)v[g.id+".vram.percent"]=Percent(used,static_cast<double>(g.vram));for(const auto*s:{"vram.used","vram.free","vram.percent"})Availability(g.id+"."+s,g.vram>0||std::string(s)=="vram.used");}
   if(ss.contains(g.id)){v[g.id+".shared.used"]=ss.at(g.id);Availability(g.id+".shared.used",true);}
   if(g.id==primaryGpu_){std::vector<std::string>ids;for(const auto&[id,def]:definitions_){(void)def;if(id.rfind("gpu.",0)==0&&id.rfind("gpu.device.",0)!=0)ids.push_back(id);}for(const auto&alias:ids){const auto full=g.id+alias.substr(3);v[alias]=v.contains(full)?v[full]:Json(nullptr);if(definitions_.contains(full)){definitions_[alias]["available"]=definitions_[full]["available"];definitions_[alias]["reason"]=definitions_[full]["reason"];}}}
  }
 }
 void ReadNvidia(Json&v){
  bool first=true;for(const auto&d:nvml_.Devices()){const auto data=nvml_.Read(d);for(const auto&[suffix,value]:data.items()){const auto alias="nvidia."+suffix,id=d.id+"."+suffix;auto descriptor=definitions_[alias];descriptor["id"]=id;descriptor["device"]=d.name;descriptor["available"]=!value.is_null();descriptor["reason"]=value.is_null()?"This NVML query is unsupported or failed":"";definitions_[id]=descriptor;v[id]=value;if(first){v[alias]=value;descriptor["id"]=alias;definitions_[alias]=descriptor;}}first=false;}
 }
 void ReadNetwork(Json&v,Clock::time_point now){
  PMIB_IF_TABLE2 table=nullptr;if(GetIfTable2(&table)!=NO_ERROR)return;std::uint64_t selected=DefaultRouteLuid();
  if(!selected){for(ULONG i=0;i<table->NumEntries;++i){const auto&r=table->Table[i];if(r.Type!=IF_TYPE_SOFTWARE_LOOPBACK&&r.OperStatus==IfOperStatusUp&&r.InterfaceAndOperStatusFlags.HardwareInterface){selected=r.InterfaceLuid.Value;break;}}}
  std::set<std::uint64_t>present;
  for(ULONG i=0;i<table->NumEntries;++i){const auto&r=table->Table[i];if(r.Type==IF_TYPE_SOFTWARE_LOOPBACK)continue;present.insert(r.InterfaceLuid.Value);wchar_t guid[64]{};StringFromGUID2(r.InterfaceGuid,guid,64);const auto id="net.adapter."+StableHash(Utf8(guid));const auto label=Utf8(r.Alias[0]?r.Alias:r.Description);const bool up=r.OperStatus==IfOperStatusUp;
   const std::vector<std::pair<std::string,std::string>>suffixes={{"download","Download"},{"upload","Upload"},{"received","Bytes Received"},{"sent","Bytes Sent"},{"linkReceive","Receive Link Speed"},{"linkTransmit","Transmit Link Speed"}};
   for(const auto&[s,title]:suffixes){Definition(id+"."+s,title,"Network",s=="received"||s=="sent"?"bytes":"B/s",s=="upload"||s=="sent"||s=="linkTransmit"?"upload":"net",label,"IP Helper GetIfTable2: interface GUID identity",up);v[id+"."+s]=nullptr;}
   if(up){v[id+".received"]=r.InOctets;v[id+".sent"]=r.OutOctets;v[id+".linkReceive"]=static_cast<double>(r.ReceiveLinkSpeed)/8;v[id+".linkTransmit"]=static_cast<double>(r.TransmitLinkSpeed)/8;
    const auto it=netPrevious_.find(r.InterfaceLuid.Value);if(it!=netPrevious_.end()){const double sec=std::chrono::duration<double>(now-it->second.time).count();Set(id+".download",Rate(it->second.in,r.InOctets,sec),v);Set(id+".upload",Rate(it->second.out,r.OutOctets,sec),v);}netPrevious_[r.InterfaceLuid.Value]={r.InOctets,r.OutOctets,now};
   }else netPrevious_.erase(r.InterfaceLuid.Value);
   if(r.InterfaceLuid.Value==selected){system_["network"]=label;for(const auto&[s,title]:suffixes){(void)title;const auto alias="net."+s;v[alias]=v[id+"."+s];definitions_[alias]["device"]=label;Availability(alias,up,up?"":"Interface disconnected");}}
  }
  for(auto it=netPrevious_.begin();it!=netPrevious_.end();)if(!present.contains(it->first))it=netPrevious_.erase(it);else++it;
  if(!selected)for(const auto* s:{"download","upload","received","sent","linkReceive","linkTransmit"})Availability(std::string("net.")+s,false,"No connected default-route interface");
  FreeMibTable(table);
 }
 void ReadDisks(Json&v){
  const std::array<std::pair<const char*,const char*>,7>fields={{{"read","read"},{"write","write"},{"idle","active"},{"latency","latency"},{"queue","queue"},{"readIops","readIops"},{"writeIops","writeIops"}}};
  for(const auto&[key,suffix]:fields){const auto a=disk_.Array(key);if(!a.valid)continue;for(const auto&[instance,raw]:a.values){double value=raw;if(std::string(key)=="idle")value=std::clamp(100.0-raw,0.0,100.0);else if(std::string(key)=="latency")value=std::max(0.0,raw)*1000;else value=std::max(0.0,raw);
    const auto alias=std::string("disk.")+suffix;if(instance==L"_Total"){v[alias]=value;Availability(alias,true);DeviceAlias(alias,"All physical disks");continue;}
    const auto id="disk.device."+StableHash(Utf8(instance))+"."+suffix;auto def=definitions_[alias];def["id"]=id;def["device"]="Disk "+Utf8(instance);def["available"]=true;def["reason"]="";definitions_[id]=def;v[id]=value;
  }}
  DWORD mask=GetLogicalDrives();for(unsigned i=0;i<26;++i)if(mask&(1u<<i)){wchar_t path[]={static_cast<wchar_t>(L'A'+i),L':',L'\\',L'\0'};if(GetDriveTypeW(path)!=DRIVE_FIXED)continue;ULARGE_INTEGER free{},total{},allFree{};if(!GetDiskFreeSpaceExW(path,&free,&total,&allFree))continue;const std::string id="disk.volume."+std::string(1,static_cast<char>('A'+i));const std::string label=Utf8(path);const auto used=total.QuadPart-allFree.QuadPart;
   for(const auto*s:{"used","free","total","percent"})Definition(id+"."+s,std::string("Volume ")+s,"Disk",std::string(s)=="percent"?"%":"bytes","copy",label,"GetDiskFreeSpaceEx; volume space, not I/O activity",true,std::string(s)=="percent"?Json(100):Json(total.QuadPart));v[id+".used"]=used;v[id+".free"]=allFree.QuadPart;v[id+".total"]=total.QuadPart;v[id+".percent"]=Percent(static_cast<double>(used),static_cast<double>(total.QuadPart));
  }
 }
};
}

Telemetry::Telemetry(Sink sink):sink_(std::move(sink)){}
Telemetry::~Telemetry(){Stop();}
void Telemetry::Start(){if(thread_.joinable())return;stopping_=false;thread_=std::thread(&Telemetry::Run,this);}
void Telemetry::Stop(){{std::lock_guard lock(mutex_);stopping_=true;}cv_.notify_all();if(thread_.joinable())thread_.join();}
void Telemetry::Configure(const Json&settings,const Json&metrics){std::lock_guard lock(mutex_);const auto s=CleanSettings(settings);seconds_=s["refreshSeconds"].get<double>();interests_.clear();if(metrics.is_array())for(const auto&id:metrics)if(id.is_string()&&id.get_ref<const std::string&>().size()<300)interests_.insert(id.get<std::string>());++revision_;cv_.notify_all();}
void Telemetry::Pause(bool paused){std::lock_guard lock(mutex_);if(paused_!=paused){paused_=paused;reset_=true;++revision_;}cv_.notify_all();}
void Telemetry::Reset(){std::lock_guard lock(mutex_);reset_=true;++revision_;cv_.notify_all();}
Json Telemetry::Diagnostics()const{std::lock_guard lock(mutex_);return diagnostics_;}
void Telemetry::Run(){
 const HRESULT com=CoInitializeEx(nullptr,COINIT_MULTITHREADED);if(FAILED(com)){Log("Telemetry COM initialization failed");return;}
 try{
  Collector collector;unsigned initialSamples=0;auto nextDiscovery=Clock::now()+std::chrono::seconds(30);int discoverySamples=0;
  while(true){
   double seconds;bool reset;std::uint64_t revision;std::set<std::string>interests;
   {std::unique_lock lock(mutex_);cv_.wait(lock,[&]{return stopping_||!paused_;});if(stopping_)break;seconds=seconds_;interests=interests_;revision=revision_;reset=reset_;reset_=false;}
   if(reset)collector.Reset();
   if(Clock::now()>=nextDiscovery){discoverySamples=2;nextDiscovery=Clock::now()+std::chrono::seconds(30);}
   try{auto packet=collector.Collect(interests,seconds,initialSamples++<2||discoverySamples>0);if(discoverySamples>0)--discoverySamples;{std::lock_guard lock(mutex_);diagnostics_=collector.Diagnostics();}sink_(std::move(packet));}catch(const std::exception&e){Log(std::string("Telemetry sample: ")+e.what());}
   std::unique_lock lock(mutex_);cv_.wait_for(lock,std::chrono::duration<double>(seconds),[&]{return stopping_||paused_||revision_!=revision;});if(stopping_)break;
  }
 }catch(const std::exception&e){Log(std::string("Telemetry initialization: ")+e.what());std::lock_guard lock(mutex_);diagnostics_["error"]=e.what();}
 CoUninitialize();
}
}
