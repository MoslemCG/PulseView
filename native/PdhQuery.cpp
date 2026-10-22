#include <algorithm>
#include "PdhQuery.h"
#include <cmath>
namespace pulse {
namespace{bool Valid(DWORD status){return status==PDH_CSTATUS_VALID_DATA||status==PDH_CSTATUS_NEW_DATA;}}
PdhQuery::PdhQuery(){if(PdhOpenQueryW(nullptr,0,&query_)!=ERROR_SUCCESS)query_=nullptr;}
PdhQuery::~PdhQuery(){if(query_)PdhCloseQuery(query_);}
bool PdhQuery::Add(const std::string&key,const wchar_t*path){if(Has(key))return true;if(!query_)return false;PDH_HCOUNTER counter=nullptr;const auto s=PdhAddEnglishCounterW(query_,path,0,&counter);if(s!=ERROR_SUCCESS)return false;counters_[key]=counter;return true;}
bool PdhQuery::Has(const std::string&key)const{return counters_.contains(key);}
bool PdhQuery::Collect(){if(!query_)return false;const auto status=PdhCollectQueryData(query_);ready_=warm_&&status==ERROR_SUCCESS;warm_=status==ERROR_SUCCESS;return ready_;}
std::optional<double> PdhQuery::Value(const std::string&key)const{
 if(!ready_)return std::nullopt;const auto it=counters_.find(key);if(it==counters_.end())return std::nullopt;PDH_FMT_COUNTERVALUE result{};
 if(PdhGetFormattedCounterValue(it->second,PDH_FMT_DOUBLE|PDH_FMT_NOCAP100,nullptr,&result)!=ERROR_SUCCESS||!Valid(result.CStatus)||!std::isfinite(result.doubleValue))return std::nullopt;return result.doubleValue;
}
CounterArray PdhQuery::Array(const std::string&key)const{
 CounterArray out;if(!ready_)return out;const auto it=counters_.find(key);if(it==counters_.end())return out;
 DWORD bytes=0,count=0;auto status=PdhGetFormattedCounterArrayW(it->second,PDH_FMT_DOUBLE|PDH_FMT_NOCAP100,&bytes,&count,nullptr);
 if(status==PDH_NO_DATA){return out;}if(status!=PDH_MORE_DATA&&status!=ERROR_SUCCESS)return out;
 // Wildcard instances can change between the size query and fetch. Retry boundedly.
 for(int attempt=0;attempt<4&&bytes<=32*1024*1024;++attempt){
  std::vector<unsigned char> buffer(std::max<DWORD>(bytes,1));auto*items=reinterpret_cast<PDH_FMT_COUNTERVALUE_ITEM_W*>(buffer.data());DWORD capacity=bytes;
  status=PdhGetFormattedCounterArrayW(it->second,PDH_FMT_DOUBLE|PDH_FMT_NOCAP100,&capacity,&count,items);
  if(status==PDH_MORE_DATA){bytes=capacity;continue;}if(status!=ERROR_SUCCESS)return out;
  out.valid=true;for(DWORD i=0;i<count;++i)if(items[i].szName&&Valid(items[i].FmtValue.CStatus)&&std::isfinite(items[i].FmtValue.doubleValue))out.values[items[i].szName]=items[i].FmtValue.doubleValue;
  return out;
 }return out;
}
}
