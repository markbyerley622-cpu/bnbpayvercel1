/**
 * React Hooks for Subscription Management
 *
 * Provides hooks for creating, managing, and charging subscriptions using BNBPay.
 */

import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import type { NetworkType } from './useInvoices';

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: string; // Amount per billing cycle
  currency: string; // Token symbol (USD1, USDT, etc.)
  tokenAddress: string;
  interval: 'monthly' | 'yearly';
  status: 'active' | 'cancelled' | 'expired';
  merchantAddress: string;
  createdAt: Date;
  network: NetworkType;
}

export interface Subscription {
  id: string;
  planId: string;
  plan: SubscriptionPlan;
  customerEmail: string;
  customerName: string;
  customerAddress: string; // Wallet address
  status: 'active' | 'cancelled' | 'expired' | 'payment_failed';
  startDate: Date;
  nextBillingDate: Date;
  lastChargeDate?: Date;
  lastChargeAmount?: string;
  lastChargeTxHash?: string;
  totalCharges: number;
  totalAmount: string;
  createdAt: Date;
  cancelledAt?: Date;
}

export interface CreatePlanParams {
  name: string;
  description: string;
  price: string;
  currency: string;
  tokenAddress: string;
  interval: 'monthly' | 'yearly';
  merchantAddress: string;
  network: NetworkType;
}

export interface CreateSubscriptionParams {
  planId: string;
  customerEmail: string;
  customerName: string;
  customerAddress: string;
}

export interface ChargeSubscriptionParams {
  subscriptionId: string;
  signer: ethers.Signer;
  provider: ethers.Provider;
}

/**
 * Hook for managing subscription plans
 */
export function useSubscriptions() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Create a new subscription plan
   */
  const createPlan = useCallback(async (params: CreatePlanParams): Promise<SubscriptionPlan> => {
    setLoading(true);
    setError(null);

    try {
      const planId = `PLAN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const plan: SubscriptionPlan = {
        id: planId,
        name: params.name,
        description: params.description,
        price: params.price,
        currency: params.currency,
        tokenAddress: params.tokenAddress,
        interval: params.interval,
        status: 'active',
        merchantAddress: params.merchantAddress,
        createdAt: new Date(),
        network: params.network,
      };

      setPlans((prev) => [...prev, plan]);
      return plan;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to create plan';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Create a new subscription for a customer
   */
  const createSubscription = useCallback(
    async (params: CreateSubscriptionParams): Promise<Subscription> => {
      setLoading(true);
      setError(null);

      try {
        const plan = plans.find((p) => p.id === params.planId);
        if (!plan) {
          throw new Error('Plan not found');
        }

        const subscriptionId = `SUB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date();

        // Calculate next billing date
        const nextBillingDate = new Date(now);
        if (plan.interval === 'monthly') {
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
        } else {
          nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
        }

        const subscription: Subscription = {
          id: subscriptionId,
          planId: params.planId,
          plan,
          customerEmail: params.customerEmail,
          customerName: params.customerName,
          customerAddress: params.customerAddress,
          status: 'active',
          startDate: now,
          nextBillingDate,
          totalCharges: 0,
          totalAmount: '0',
          createdAt: now,
        };

        setSubscriptions((prev) => [...prev, subscription]);
        return subscription;
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to create subscription';
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [plans]
  );

  /**
   * Charge a subscription (execute recurring payment)
   * This would typically be called by a backend cron job
   * For demo purposes, can be called manually
   */
  const chargeSubscription = useCallback(
    async (params: ChargeSubscriptionParams): Promise<{ txHash: string; paymentId: string }> => {
      setLoading(true);
      setError(null);

      try {
        const subscription = subscriptions.find((s) => s.id === params.subscriptionId);
        if (!subscription) {
          throw new Error('Subscription not found');
        }

        if (subscription.status !== 'active') {
          throw new Error('Subscription is not active');
        }

        // In a real implementation, this would:
        // 1. Build a payment intent with the subscription ID as reference
        // 2. Use Permit2 to charge the customer's wallet
        // 3. Update the subscription billing date
        //
        // For now, this is a placeholder that shows the structure

        const chargeAmount = subscription.plan.price;
        const totalAmount = (
          parseFloat(subscription.totalAmount) + parseFloat(chargeAmount)
        ).toString();

        // Simulate payment processing
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Update subscription
        setSubscriptions((prev) =>
          prev.map((sub) => {
            if (sub.id === params.subscriptionId) {
              const nextBillingDate = new Date(sub.nextBillingDate);
              if (sub.plan.interval === 'monthly') {
                nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
              } else {
                nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
              }

              return {
                ...sub,
                lastChargeDate: new Date(),
                lastChargeAmount: chargeAmount,
                lastChargeTxHash: `0x${Math.random().toString(16).slice(2)}`,
                totalCharges: sub.totalCharges + 1,
                totalAmount,
                nextBillingDate,
              };
            }
            return sub;
          })
        );

        return {
          txHash: `0x${Math.random().toString(16).slice(2)}`,
          paymentId: `PAY-${Date.now()}`,
        };
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to charge subscription';
        setError(errorMessage);

        // Mark subscription as payment failed
        setSubscriptions((prev) =>
          prev.map((sub) =>
            sub.id === params.subscriptionId
              ? { ...sub, status: 'payment_failed' as const }
              : sub
          )
        );

        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [subscriptions]
  );

  /**
   * Cancel a subscription
   */
  const cancelSubscription = useCallback((subscriptionId: string) => {
    setSubscriptions((prev) =>
      prev.map((sub) => {
        if (sub.id === subscriptionId) {
          return {
            ...sub,
            status: 'cancelled' as const,
            cancelledAt: new Date(),
          };
        }
        return sub;
      })
    );
  }, []);

  /**
   * Check for subscriptions that need billing
   */
  const checkDueBillings = useCallback(() => {
    const now = new Date();
    return subscriptions.filter(
      (sub) => sub.status === 'active' && sub.nextBillingDate <= now
    );
  }, [subscriptions]);

  /**
   * Get active subscriptions
   */
  const getActiveSubscriptions = useCallback(() => {
    return subscriptions.filter((sub) => sub.status === 'active');
  }, [subscriptions]);

  /**
   * Get subscriptions by customer
   */
  const getCustomerSubscriptions = useCallback(
    (customerAddress: string) => {
      return subscriptions.filter(
        (sub) => sub.customerAddress.toLowerCase() === customerAddress.toLowerCase()
      );
    },
    [subscriptions]
  );

  return {
    plans,
    subscriptions,
    loading,
    error,
    createPlan,
    createSubscription,
    chargeSubscription,
    cancelSubscription,
    checkDueBillings,
    getActiveSubscriptions,
    getCustomerSubscriptions,
  };
}
