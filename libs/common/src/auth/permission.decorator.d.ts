export declare const PERMISSION_KEY = "required_permission";
export type ResourceAction = [resource: string, action: string];
export declare const RequirePermission: (resource: string, action: string) => <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
export declare const Public: () => import("@nestjs/common").CustomDecorator<string>;
