import 'server-only';

import { auth, clerkClient } from '@clerk/nextjs/server';

import { PLAN_LIMITS, PLANS, type PlanLimits, type PlanType } from '@/lib/subscription-constants';
import { getPlanFromHas, getPlanFromMetadata, type ProductOrPlanCheck } from '@/lib/subscription-utils';

export type AuthenticatedUserPlanResult =
    | {
        success: true;
        userId: string;
        plan: PlanType;
        limits: PlanLimits;
    }
    | {
        success: false;
        error: 'Unauthorized';
    };

export const getAuthenticatedUserPlan = async (): Promise<AuthenticatedUserPlanResult> => {
    const { userId, has } = await auth();

    if (!userId) {
        return { success: false, error: 'Unauthorized' };
    }

    const hasProductOrPlan = has as unknown as ProductOrPlanCheck | undefined;
    const planFromHas = getPlanFromHas(hasProductOrPlan);

    if (planFromHas && planFromHas !== PLANS.FREE) {
        return {
            success: true,
            userId,
            plan: planFromHas,
            limits: PLAN_LIMITS[planFromHas],
        };
    }

    try {
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        const metadataPlan = getPlanFromMetadata(user.publicMetadata);
        const plan = metadataPlan ?? planFromHas ?? PLANS.FREE;

        return {
            success: true,
            userId,
            plan,
            limits: PLAN_LIMITS[plan],
        };
    } catch (error) {
        console.error('Failed to resolve plan from Clerk metadata, defaulting to free plan.', error);

        return {
            success: true,
            userId,
            plan: planFromHas ?? PLANS.FREE,
            limits: PLAN_LIMITS[planFromHas ?? PLANS.FREE],
        };
    }
};