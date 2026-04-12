'use client';

import { useAuth, useUser } from '@clerk/nextjs';

import { PLAN_LIMITS, PLANS, type PlanType } from '@/lib/subscription-constants';
import { getPlanFromHas, getPlanFromMetadata, type ProductOrPlanCheck } from '@/lib/subscription-utils';

export const useSubscription = () => {
    const { has, isLoaded: isAuthLoaded } = useAuth();
    const { user, isLoaded: isUserLoaded } = useUser();
    const hasProductOrPlan = has as unknown as ProductOrPlanCheck | undefined;

    const isLoaded = isAuthLoaded && isUserLoaded;

    if (!isLoaded) {
        return {
            plan: PLANS.FREE,
            limits: PLAN_LIMITS[PLANS.FREE],
            isLoaded: false
        };
    }

    const planFromHas = getPlanFromHas(hasProductOrPlan);
    const metadataPlan = getPlanFromMetadata(user?.publicMetadata);

    let plan: PlanType = planFromHas ?? PLANS.FREE;
    if (plan === PLANS.FREE && metadataPlan) {
        plan = metadataPlan;
    }

    return {
        plan,
        limits: PLAN_LIMITS[plan],
        isLoaded: true,
    };
};