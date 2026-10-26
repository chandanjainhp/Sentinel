'use client';

import Link from 'next/link';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-surface-alt border-t border-surface-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 bg-gradient-to-br from-primary to-primary-light rounded flex items-center justify-center">
                <span className="text-white text-sm">🏢</span>
              </div>
              <span className="font-bold text-text-primary">Sentinel</span>
            </div>
            <p className="text-text-secondary text-sm">
              Overnight Intelligence Platform for industrial sites.
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="font-semibold text-text-primary mb-4">Product</h3>
            <ul className="space-y-2">
              <li>
                <Link href="#features" className="text-text-secondary hover:text-primary transition text-sm">
                  Features
                </Link>
              </li>
              <li>
                <Link href="#how-it-works" className="text-text-secondary hover:text-primary transition text-sm">
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="#pricing" className="text-text-secondary hover:text-primary transition text-sm">
                  Pricing
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="font-semibold text-text-primary mb-4">Company</h3>
            <ul className="space-y-2">
              <li>
                <a href="#about" className="text-text-secondary hover:text-primary transition text-sm">
                  About
                </a>
              </li>
              <li>
                <a href="#contact" className="text-text-secondary hover:text-primary transition text-sm">
                  Contact
                </a>
              </li>
              <li>
                <a href="#blog" className="text-text-secondary hover:text-primary transition text-sm">
                  Blog
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-semibold text-text-primary mb-4">Legal</h3>
            <ul className="space-y-2">
              <li>
                <Link href="#privacy" className="text-text-secondary hover:text-primary transition text-sm">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="#terms" className="text-text-secondary hover:text-primary transition text-sm">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="#security" className="text-text-secondary hover:text-primary transition text-sm">
                  Security
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-surface-dark pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-text-secondary text-sm">
              © {currentYear} Sentinel Overnight Intelligence Platform. All rights reserved.
            </p>
            <div className="flex gap-4 mt-4 md:mt-0">
              <a href="#twitter" className="text-text-secondary hover:text-primary transition">
                Twitter
              </a>
              <a href="#linkedin" className="text-text-secondary hover:text-primary transition">
                LinkedIn
              </a>
              <a href="#github" className="text-text-secondary hover:text-primary transition">
                GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
