#include "TelemetryMath.h"
#include <iostream>
#include <limits>
#include <stdexcept>
void require(bool condition,const char* message){if(!condition)throw std::runtime_error(message);}
int main(){
 try {
  using namespace pulse;
  require(Rate(100,500,2).value()==200,"actual elapsed time");
  require(!Rate(500,100,2),"counter reset must not wrap into a huge rate");
  require(!Rate(0,1,0),"zero interval");
  require(!Rate(0,1,std::numeric_limits<double>::quiet_NaN()),"NaN interval");
  require(CpuBusy(0,0,0,25,50,50).value()==75,"kernel time includes idle");
  require(!CpuBusy(0,0,0,0,0,0),"initial CPU baseline");
  require(Percent(12,24)==50,"memory percent");
  require(Percent(30,24)==100,"clamp utilization");
  require(BusiestEngine({{"3d",75},{"compute",90},{"copy",15}})==90,"use busiest physical engine, not sum or average");
  require(BusiestEngine({{"engine",130}})==100,"clamp aggregate process contributions");
  require(StableHash("adapter-A")==StableHash("adapter-A"),"stable device key");
  require(StableHash("adapter-A")!=StableHash("adapter-B"),"distinct device key");
  std::cout<<"12 portable telemetry checks passed\n";return 0;
 }catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}
}
