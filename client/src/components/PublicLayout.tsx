import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";

interface PublicLayoutProps {
  children: React.ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  const navLinks = [
    { href: "/#how-it-works", label: "How it works" },
    { href: "/#solutions", label: "Solutions" },
    { href: "/pricing", label: "Pricing" },
    { href: "/contact", label: "About" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0F1729]">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-0 cursor-pointer">
              <span className="text-lg font-bold text-white">
                Lendry.
              </span>
              <span className="text-lg font-bold text-blue-500">
                AI
              </span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <a className="text-sm font-medium text-gray-400 hover:text-white transition-colors">
                  {link.label}
                </a>
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Link href="/login">
              <a className="text-sm font-medium text-gray-400 hover:text-white transition-colors cursor-pointer">
                Log in
              </a>
            </Link>
            <Button
              variant="outline"
              size="sm"
              className="border border-white text-white rounded-md hover:bg-white hover:text-[#0F1729] transition-colors"
            >
              Request access
            </Button>
          </div>

          <button
            className="md:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5 text-white" />
            ) : (
              <Menu className="w-5 h-5 text-white" />
            )}
          </button>
        </nav>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#0F1729]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-4">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href}>
                  <a className="text-sm font-medium text-gray-400 hover:text-white transition-colors block py-2">
                    {link.label}
                  </a>
                </Link>
              ))}
              <div className="flex flex-col gap-2 pt-4 border-t border-white/10">
                <Link href="/login">
                  <a className="text-sm font-medium text-gray-400 hover:text-white transition-colors block py-2">
                    Log in
                  </a>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="border border-white text-white rounded-md hover:bg-white hover:text-[#0F1729] transition-colors w-full"
                >
                  Request access
                </Button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-[#0F1729] border-t border-white/10 mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8 mb-12">
            <div className="md:col-span-1">
              <div className="flex items-center gap-0 mb-4">
                <span className="text-sm font-bold text-white">
                  Lendry.
                </span>
                <span className="text-sm font-bold text-blue-500">
                  AI
                </span>
              </div>
              <p className="text-xs text-gray-400">
                The intelligent loan origination platform for modern lenders.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-4">
                Product
              </h3>
              <ul className="space-y-2 text-xs">
                <li>
                  <Link href="/#features">
                    <a className="text-gray-400 hover:text-white transition-colors">
                      Features
                    </a>
                  </Link>
                </li>
                <li>
                  <Link href="/pricing">
                    <a className="text-gray-400 hover:text-white transition-colors">
                      Pricing
                    </a>
                  </Link>
                </li>
                <li>
                  <Link href="/use-cases">
                    <a className="text-gray-400 hover:text-white transition-colors">
                      Use Cases
                    </a>
                  </Link>
                </li>
                <li>
                  <Link href="/contact">
                    <a className="text-gray-400 hover:text-white transition-colors">
                      Contact
                    </a>
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-4">
                Company
              </h3>
              <ul className="space-y-2 text-xs">
                <li>
                  <Link href="/contact">
                    <a className="text-gray-400 hover:text-white transition-colors">
                      About
                    </a>
                  </Link>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-white transition-colors">
                    Blog
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-4">
                Legal
              </h3>
              <ul className="space-y-2 text-xs">
                <li>
                  <Link href="/privacy">
                    <a className="text-gray-400 hover:text-white transition-colors">
                      Privacy
                    </a>
                  </Link>
                </li>
                <li>
                  <Link href="/terms">
                    <a className="text-gray-400 hover:text-white transition-colors">
                      Terms
                    </a>
                  </Link>
                </li>
                <li>
                  <Link href="/security">
                    <a className="text-gray-400 hover:text-white transition-colors">
                      Security
                    </a>
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-4">
                Social
              </h3>
              <div className="flex gap-3">
                <a
                  href="#"
                  className="w-8 h-8 rounded flex items-center justify-center text-xs text-gray-400 hover:text-white transition-colors"
                  aria-label="Twitter"
                >
                  𝕏
                </a>
                <a
                  href="#"
                  className="w-8 h-8 rounded flex items-center justify-center text-xs text-gray-400 hover:text-white transition-colors"
                  aria-label="LinkedIn"
                >
                  in
                </a>
                <a
                  href="#"
                  className="w-8 h-8 rounded flex items-center justify-center text-xs text-gray-400 hover:text-white transition-colors"
                  aria-label="GitHub"
                >
                  gh
                </a>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-8 text-xs text-gray-400 text-center">
            <p>
              &copy; {new Date().getFullYear()} Lendry.AI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
