/**
 * Reusable field display component for preview panels
 * Shows label + value in a consistent format
 */

interface FieldProps {
  label: string;
  value: string | number | null | undefined;
}

export default function Field({ label, value }: FieldProps) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm text-[#191C1E] mt-0.5">{value}</dd>
    </div>
  );
}
