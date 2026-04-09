import { PLANS, type PlanType } from '@/lib/subscription-constants';

export type ProductOrPlanCheck = (params: { product?: string; plan?: string }) => boolean;

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const normalizePlanValue = (value: unknown): PlanType | null => {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim().toLowerCase();

    if (normalized === PLANS.FREE || normalized === PLANS.STANDARD || normalized === PLANS.PRO) {
        return normalized;
    }

    return null;
};

export const getPlanFromHas = (has?: ProductOrPlanCheck): PlanType | null => {
    if (!has) {
        return null;
    }

    if (has({ product: PLANS.PRO }) || has({ plan: PLANS.PRO })) {
        return PLANS.PRO;
    }

    if (has({ product: PLANS.STANDARD }) || has({ plan: PLANS.STANDARD })) {
        return PLANS.STANDARD;
    }

    return PLANS.FREE;
};

export const getPlanFromMetadata = (metadata: unknown): PlanType | null => {
    if (!isRecord(metadata)) {
        return null;
    }

    const metadataPlan = normalizePlanValue(metadata.plan);
    if (metadataPlan) {
        return metadataPlan;
    }

    return normalizePlanValue(metadata.billingPlan);
};

export const formatPlanName = (plan: PlanType): string => {
    return `${plan.charAt(0).toUpperCase()}${plan.slice(1)}`;
};