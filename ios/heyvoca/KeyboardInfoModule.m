#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(KeyboardInfoModule, NSObject)

RCT_EXTERN_METHOD(getStatus:(NSString *)lang
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(openSettings:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
