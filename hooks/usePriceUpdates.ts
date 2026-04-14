import { useState, useEffect, useRef } from 'react';

export interface PriceUpdate {
  price: number;
  change: number;
  timestamp: number;
}

export interface UsePriceUpdatesOptions {
  interval?: number;
  enabled?: boolean;
}

export function usePriceUpdates(
  fetchPrice: () => Promise<number | null>,
  options: UsePriceUpdatesOptions = {}
) {
  const { interval = 10000, enabled = true } = options;

  const [price, setPrice] = useState<number | null>(null);
  const [previousPrice, setPreviousPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updatePrice = async () => {
    if (!enabled) return;

    setIsUpdating(true);
    try {
      const newPrice = await fetchPrice();

      if (newPrice !== null) {
        setPreviousPrice(price);

        if (price !== null) {
          const change = ((newPrice - price) / price) * 100;
          setPriceChange(change);
        }

        setPrice(newPrice);
        setLastUpdate(Date.now());
      }
    } catch (error) {
      console.error('Error updating price:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    updatePrice();

    intervalRef.current = setInterval(updatePrice, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, interval]);

  const refresh = () => {
    updatePrice();
  };

  return {
    price,
    previousPrice,
    priceChange,
    isUpdating,
    lastUpdate,
    refresh,
  };
}
