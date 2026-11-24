import {
  Banknote, Briefcase, Car, Clapperboard, Coffee, CreditCard, Gift, GraduationCap,
  HeartPulse, Home, Laptop, Plane, PlusCircle, Repeat, ShoppingBag, ShoppingBasket,
  Smartphone, Sparkles, Tag, TrendingUp, UtensilsCrossed, Wallet, Zap, BookOpen, Dumbbell, Baby,
} from 'lucide-react';

const icons = {
  Banknote, Briefcase, Car, Clapperboard, Coffee, CreditCard, Gift, GraduationCap,
  HeartPulse, Home, Laptop, Plane, PlusCircle, Repeat, ShoppingBag, ShoppingBasket,
  Smartphone, Sparkles, Tag, TrendingUp, UtensilsCrossed, Wallet, Zap, BookOpen, Dumbbell, Baby,
} as const;

export function CategoryIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = (name && icons[name as keyof typeof icons]) || Tag;
  return <Icon className={className} />;
}
