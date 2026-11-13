# 📸 UTHM Community Profile Image Retrieval Specification & Prompt

This document provides technical specifications, API endpoint structures, code implementations, and a **Reusable System Prompt** for dynamically retrieving student and staff profile images from the official UTHM Community endpoint (`community.uthm.edu.my`).

You can attach or copy `IMG.md` into any codebase or AI tool (Antigravity, Copilot, ChatGPT, Claude) to instantly implement UTHM profile photo resolution.

---

## 🤖 REUSABLE SYSTEM PROMPT (Copy/Attach This Section)

```text
Implement or update the profile picture resolution logic for UTHM Students and Staff using the official community.uthm.edu.my endpoints according to the following specifications:

1. USER TYPE IDENTIFICATION:
   - Student: Email ends with '@student.uthm.edu.my' OR ID matches a student matric number format (e.g., AI220123, BIT21099).
   - Staff: Email ends with '@uthm.edu.my' OR ID matches a UTHM Staff ID (e.g., 01234, H5678).

2. STUDENT IMAGE ENDPOINT:
   - URL Pattern: https://community.uthm.edu.my/images/students/{SESSION}/{MATRIC}.jpg
   - {SESSION} Calculation:
     * Extract the 2-digit intake year from the matric number (e.g., "AI220123" -> "22").
     * Start Year = 2000 + 22 = 2022.
     * End Year = Start Year + 1 = 2023.
     * Session string format: `${StartYear}${EndYear}` (e.g., "20222023").
     * If no year digits are present in the matric string, use a fallback session (e.g., "20252026").
   - {MATRIC} Format: Uppercase matric number without spaces (e.g., "AI220123").

3. STAFF IMAGE ENDPOINT:
   - URL Pattern: https://community.uthm.edu.my/images/profiles/{STAFF_ID}.jpg
   - {STAFF_ID} Format: Uppercase staff ID string without spaces (e.g., "01234").

4. FRAMEWORK & UI INTEGRATION:
   - Whitelist the hostname 'community.uthm.edu.my' in image loader configuration (e.g., Next.js remotePatterns).
   - Implement an image loading fallback (onError handler) to render initial avatars or placeholder SVGs when images return HTTP 404.
```

---

## 🛠️ TECHNICAL SPECIFICATIONS & ENDPOINTS

### 1. Student Profile Images
- **Base Endpoint**: `https://community.uthm.edu.my/images/students/{SESSION}/{MATRIC}.jpg`
- **Session Parsing Logic**:
  | Matric Number | Extracted Year | Start Year | End Year | Session String | Resolved Image URL |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `AI220123` | `22` | 2022 | 2023 | `20222023` | `https://community.uthm.edu.my/images/students/20222023/AI220123.jpg` |
  | `CN210045` | `21` | 2021 | 2022 | `20212022` | `https://community.uthm.edu.my/images/students/20212022/CN210045.jpg` |
  | `BIT23001` | `23` | 2023 | 2024 | `20232024` | `https://community.uthm.edu.my/images/students/20232024/BIT23001.jpg` |

---

### 2. Staff Profile Images
- **Base Endpoint**: `https://community.uthm.edu.my/images/profiles/{STAFF_ID}.jpg`
- **Sample Endpoint Resolution**:
  | Staff ID | Resolved Image URL |
  | :--- | :--- |
  | `01234` | `https://community.uthm.edu.my/images/profiles/01234.jpg` |
  | `H5678` | `https://community.uthm.edu.my/images/profiles/H5678.jpg` |

---

## 💻 IMPLEMENTATION SNIPPETS

### TypeScript / JavaScript Helper Function
```typescript
/**
 * Resolves the UTHM profile image URL based on user email and ID number.
 * 
 * @param email User email address (e.g., student@student.uthm.edu.my or staff@uthm.edu.my)
 * @param idNumber Student Matric Number or Staff ID
 * @returns Fully formatted HTTPS image URL or empty string
 */
export function getProfileImageUrl(email: string, idNumber: string): string {
  if (!idNumber) return '';

  const cleanEmail = (email || '').toLowerCase().trim();
  const rawId = idNumber.split(',')[0].trim().toUpperCase();

  // Determine if the user is a student
  const isStudent = cleanEmail.endsWith('@student.uthm.edu.my') || /^[a-zA-Z]/.test(rawId);

  if (isStudent) {
    const matric = rawId;
    let session = '20252026'; // Default fallback session
    
    // Extract 2-digit intake year from the matric string
    const yearMatch = matric.match(/\d{2}/);
    if (yearMatch) {
      const startYear = 2000 + parseInt(yearMatch[0], 10);
      const endYear = startYear + 1;
      session = `${startYear}${endYear}`;
    }

    return `https://community.uthm.edu.my/images/students/${session}/${matric}.jpg`;
  }

  // Staff profile image endpoint
  return `https://community.uthm.edu.my/images/profiles/${rawId}.jpg`;
}
```

---

## ⚙️ FRAMEWORK CONFIGURATION & UI INTEGRATION

### 1. Next.js Config (`next.config.ts` / `next.config.js`)
When using Next.js `<Image />` component, add `community.uthm.edu.my` to `remotePatterns`:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'community.uthm.edu.my',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
```

### 2. React Avatar Component with Fallback Handling
```tsx
import React, { useState } from 'react';
import Image from 'next/image';
import { getProfileImageUrl } from '@/lib/utils';

interface UTHMAvatarProps {
  name: string;
  email: string;
  idNumber: string;
  size?: number;
}

export function UTHMAvatar({ name, email, idNumber, size = 40 }: UTHMAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const imageUrl = getProfileImageUrl(email, idNumber);

  if (hasError || !imageUrl) {
    return (
      <div 
        className="rounded-full bg-teal-700 text-white flex items-center justify-center font-semibold text-sm shadow-sm"
        style={{ width: size, height: size }}
      >
        {name ? name.charAt(0).toUpperCase() : 'U'}
      </div>
    );
  }

  return (
    <Image
      src={imageUrl}
      alt={name || 'UTHM User Profile'}
      width={size}
      height={size}
      className="rounded-full object-cover shadow-sm"
      onError={() => setHasError(true)}
    />
  );
}
```
