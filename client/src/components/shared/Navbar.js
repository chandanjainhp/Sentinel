// 'use client';

// import Link from 'next/link';
// import { useState } from 'react';

// export default function Navbar({ transparent = false }) {
//   const [isOpen, setIsOpen] = useState(false);
//   return (
//     <nav className={`fixed top-0 w-full z-50 transition-all ${
//       transparent ? 'bg-transparent' : 'bg-surface border-b border-border'
//     }`}>
//       <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
//         <div className="flex justify-between items-center h-16">
//           {/* Logo */}
//           <div className="shrink-0">
//             <Link href="/" className="flex items-center gap-2">
//               <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
//                 <span className="text-white font-bold text-lg">🏢</span>
//               </div>
//               <span className="text-xl font-bold text-text-primary hidden sm:inline">
//                 Sentinel
//               </span>
//             </Link>
//           </div>

//           {/* Links */}
//           <div className="hidden md:flex items-center gap-8">
//             <Link href="#features" className="text-[15px] font-semibold text-text-secondary hover:text-text-primary transition">
//               Features
//             </Link>
//             <Link href="#how-it-works" className="text-[15px] font-semibold text-text-secondary hover:text-text-primary transition">
//               How It Works
//             </Link>
//             <Link href="#testimonials" className="text-[15px] font-semibold text-text-secondary hover:text-text-primary transition">
//               Testimonials
//             </Link>
//           </div>

//           {/* CTAs */}
//           <div className="flex items-center gap-4">
//             <Link
//               href="/login"
//               className="text-[15px] font-semibold text-text-primary hover:text-text-secondary transition hidden sm:block"
//             >
//               Login
//             </Link>
//             <Link
//               href="/register"
//               className="bg-primary hover:bg-primary-hover text-white px-6 py-3 rounded-[30px] transition-colors duration-200 font-medium text-[15px] hidden sm:block"
//             >
//               Get Started
//             </Link>
//             {/* Mobile Toggle Button */}
//             <button
//               className="flex md:hidden p-2 text-text-primary focus:outline-none"
//               onClick={() => setIsOpen(!isOpen)}
//             >
//               {isOpen ? '✕' : '☰'}
//             </button>
//           </div>
//         </div>

//         {/* Mobile Menu */}
//         {isOpen && (
//           <div className="md:hidden flex flex-col gap-4 pb-4 pt-2 px-2 border-t border-surface-alt mt-2">
//             <Link href="#features" className="text-text-secondary hover:text-text-primary transition block w-full py-2" onClick={() => setIsOpen(false)}>Features</Link>
//             <Link href="#how-it-works" className="text-text-secondary hover:text-text-primary transition block w-full py-2" onClick={() => setIsOpen(false)}>How It Works</Link>
//             <Link href="#testimonials" className="text-text-secondary hover:text-text-primary transition block w-full py-2" onClick={() => setIsOpen(false)}>Testimonials</Link>
//             <Link href="/login" className="text-text-primary hover:text-text-secondary transition block w-full py-2" onClick={() => setIsOpen(false)}>Login</Link>
//             <Link href="/register" className="text-text-primary font-medium block w-full py-2" onClick={() => setIsOpen(false)}>Get Started</Link>
//           </div>
//         )}
//       </div>
//     </nav>
//   );
// }
import Link from "next/link";

export default function Navbar({ transparent = false }) {
  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-all ${
        transparent ? "bg-transparent" : "bg-surface border-b border-border"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="shrink-0">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-lg">🏢</span>
              </div>
              <span className="text-xl font-bold text-text-primary hidden sm:inline">
                Sentinel
              </span>
            </Link>
          </div>

          {/* Links */}
          <div className="hidden md:flex items-center gap-8">
            <Link
              href="#features"
              className="text-[15px] font-semibold text-text-secondary hover:text-text-primary transition"
            >
              Features
            </Link>
            <Link
              href="#how-it-works"
              className="text-[15px] font-semibold text-text-secondary hover:text-text-primary transition"
            >
              How It Works
            </Link>
            <Link
              href="#testimonials"
              className="text-[15px] font-semibold text-text-secondary hover:text-text-primary transition"
            >
              Testimonials
            </Link>
          </div>

          {/* CTAs & Mobile Menu */}
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-[15px] font-semibold text-text-primary hover:text-text-secondary transition hidden sm:block"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="bg-primary hover:bg-primary-hover text-white px-6 py-3 rounded-[30px] transition-colors duration-200 font-medium text-[15px] hidden sm:block"
            >
              Get Started
            </Link>

            {/* Mobile Menu (Server Component compatible) */}
            <details className="md:hidden group relative">
              <summary className="flex p-2 text-text-primary focus:outline-none cursor-pointer list-none">
                <span className="group-open:hidden">☰</span>
                <span className="hidden group-open:inline">✕</span>
              </summary>
              <div className="absolute top-full right-0 w-48 flex flex-col gap-2 pb-4 pt-2 px-4 bg-surface border border-border rounded-lg shadow-lg mt-2 z-50">
                <Link
                  href="#features"
                  className="text-text-secondary hover:text-text-primary transition block w-full py-2"
                >
                  Features
                </Link>
                <Link
                  href="#how-it-works"
                  className="text-text-secondary hover:text-text-primary transition block w-full py-2"
                >
                  How It Works
                </Link>
                <Link
                  href="#testimonials"
                  className="text-text-secondary hover:text-text-primary transition block w-full py-2"
                >
                  Testimonials
                </Link>
                <Link
                  href="/login"
                  className="text-text-primary hover:text-text-secondary transition block w-full py-2"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="text-text-primary font-medium block w-full py-2"
                >
                  Get Started
                </Link>
              </div>
            </details>
          </div>
        </div>
      </div>
    </nav>
  );
}
