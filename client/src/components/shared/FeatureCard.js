'use client';

/**
 * Feature card component for landing page
 */
export default function FeatureCard({ icon: Icon, title, description }) {
  return (
    <div className="p-6 rounded-lg border border-surface-alt hover:border-primary transition-all hover:shadow-lg hover:shadow-primary/10 cursor-pointer group">
      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition">
        <Icon className="w-6 h-6 text-primary" />
      </div>

      <h3 className="text-lg font-semibold text-text-primary mb-2">
        {title}
      </h3>

      <p className="text-text-secondary text-sm leading-relaxed">
        {description}
      </p>
    </div>
  );
}
