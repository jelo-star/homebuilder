import Image from 'next/image';

interface BrandLogoProps {
  className?: string;
}

export default function BrandLogo({ className = '' }: BrandLogoProps) {
  return (
    <Image
      src="/homebuilder-logo.png"
      alt="HomeBuilder"
      width={872}
      height={184}
      className={`block object-contain ${className}`}
      priority
    />
  );
}
