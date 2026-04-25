export interface TenantContext {
    tenantId: string;
    shopId?: string;
    userId: string;
}
export declare const CurrentTenant: (...dataOrPipes: unknown[]) => ParameterDecorator;
export declare const CurrentUser: (...dataOrPipes: unknown[]) => ParameterDecorator;
