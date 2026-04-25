import { TenantScopedEntity } from '@shoposphere/common';
export declare class User extends TenantScopedEntity {
    shopId: string | null;
    cognitoSub: string;
    email: string;
    phone: string;
    name: string;
    passwordHash: string;
    profileId: string;
    roleId: string;
    isActive: boolean;
    isPlatformAdmin: boolean;
    lastLogin: Date;
    refreshTokenHash: string;
}
