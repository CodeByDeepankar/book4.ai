import { PricingTable } from '@clerk/nextjs';

export default function SubscriptionsPage() {
  return (
    <main className="clerk-subscriptions">
      <section className="w-full max-w-6xl">
        <h1 className="page-title">Choose Your Plan</h1>
        <p className="page-description">
          Upgrade to unlock more books, longer sessions, and expanded monthly usage.
        </p>

        <div className="clerk-pricing-table-wrapper mt-10">
          <PricingTable />
        </div>
      </section>
    </main>
  );
}
