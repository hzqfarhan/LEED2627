'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { Role } from '@/lib/shared';
import ClickSounds from './ClickSounds';
import SignOutButton from './SignOutButton';

const ICONS: Record<string, ReactNode> = {
  home: <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  stalls: (
    <>
      <path d="M3 10 12 4l9 6z" />
      <path d="M5 10v9M19 10v9M9 19v-5h6v5" />
    </>
  ),
  map: (
    <>
      <path d="M12 21s6-5.6 6-10.5A6 6 0 0 0 6 10.500C6 15.400 12 21 12 21z" />
      <circle cx="12" cy="10.500" r="2" />
    </>
  ),
  wall: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="1.500" />
      <path d="M7 8h10v7H7zM12 3v4" />
    </>
  ),
  judge: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4h6v3H9zM8.500 13l2.300 2.300 4.700-4.800" />
    </>
  ),
  mystall: (
    <>
      <path d="M4 9h16l-1.500-4h-13z" />
      <path d="M5 9v10h14V9M9 19v-5h6v5" />
    </>
  ),
  admin: <path d="M5 7h9M18 7h1M5 12h2M11 12h8M5 17h9M18 17h1M16 5v4M9 10v4M16 15v4" />,
  signin: (
    <>
      <circle cx="9" cy="12" r="3.500" />
      <path d="M12.500 12H20M17 12v3" />
    </>
  ),
  results: <path d="M5 20v-6h4v6M10 20V8h4v12M15 20v-9h4v9M3 20h18" />,
};

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="tab-icon">
      {ICONS[name]}
    </svg>
  );
}

interface Props {
  role: Role | null;
  name: string | null;
}

export default function NavLinks({ role, name }: Props) {
  const pathname = usePathname() ?? '/';
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

  const account =
    role === 'admin'
      ? { href: '/admin', label: 'Admin', icon: 'admin' }
      : role === 'judge'
        ? { href: '/judge', label: 'Judging', icon: 'judge' }
        : role === 'stall'
          ? { href: '/stall', label: 'My stall', icon: 'mystall' }
          : { href: '/login', label: 'Sign in', icon: 'signin' };

  const top = [
    { href: '/stalls', label: 'Stalls', wide: true },
    { href: '/map', label: 'Map', wide: true },
    { href: '/wall', label: 'Memory wall', wide: true },
    { href: '/results', label: 'Results', wide: false },
    ...(role === 'admin' ? [{ href: '/judge', label: 'Judging', wide: false }] : []),
    { href: account.href, label: account.label, wide: true },
  ];

  const tabs = [
    { href: '/', label: 'Home', icon: 'home' },
    { href: '/stalls', label: 'Stalls', icon: 'stalls' },
    { href: '/map', label: 'Map', icon: 'map' },
    { href: '/wall', label: 'Wall', icon: 'wall' },
    account,
  ];

  return (
    <>
      <nav className="nav-links" aria-label="Main">
        {top.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={[item.wide ? 'nav-wide' : '', item.href === '/login' ? 'nav-cta' : ''].join(' ').trim() || undefined}
            aria-current={isActive(item.href) ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
        {role && name && <SignOutButton name={name} />}
        <ClickSounds />
      </nav>

      {/* Phones: the main destinations sit under the thumb. */}
      <nav className="tabbar" aria-label="Main, phone">
        {tabs.map((item) => (
          <Link key={item.href} href={item.href} className="tabbar-item" aria-current={isActive(item.href) ? 'page' : undefined}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
