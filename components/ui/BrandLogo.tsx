import Image from 'next/image';

interface BrandLogoProps {
  className?: string;
}

export default function BrandLogo({ className = '' }: BrandLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Image
        src="/gawa-yad-icon.png"
        alt=""
        width={184}
        height={184}
        className="h-9 w-9 shrink-0 object-contain"
        priority
      />
      <span className="text-xl font-black tracking-tight text-slate-900">
        Gawa-Yad
      </span>
    </span>
  );
}
