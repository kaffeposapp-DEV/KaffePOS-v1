import { Coffee, Pizza, Utensils, CupSoda, Sandwich } from 'lucide-react';

interface Props {
  category?: string;
  className?: string;
  iconSize?: number;
}

export default function ProductPlaceholder({ category = 'All', className = "", iconSize = 48 }: Props) {
  const getIcon = () => {
    const c = category.toLowerCase();
    if (c.includes('kopi') || c.includes('minum') || c.includes('drink')) return <Coffee size={iconSize} />;
    if (c.includes('makan') || c.includes('food')) return <Utensils size={iconSize} />;
    if (c.includes('snack') || c.includes('cemilan')) return <Pizza size={iconSize} />;
    if (c.includes('soda') || c.includes('jus')) return <CupSoda size={iconSize} />;
    if (c.includes('roti') || c.includes('sandwich')) return <Sandwich size={iconSize} />;
    return <Coffee size={iconSize} />;
  };

  return (
    <div className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200/50 text-slate-300 relative overflow-hidden ${className}`}>
      {/* Decorative patterns */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ 
        backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)',
        backgroundSize: '16px 16px' 
      }} />
      
      <div className="relative z-10 transition-transform duration-500 group-hover:scale-110 group-hover:text-orange-300/50">
        {getIcon()}
      </div>
      
      {/* Subtle brand mark */}
      <div className="absolute bottom-3 text-[8px] font-black tracking-[0.3em] uppercase opacity-20 select-none">
        KaffePOS Visual
      </div>
    </div>
  );
}
