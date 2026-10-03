import { Textarea } from "@usace/groundwork";

interface JinjaTemplateFieldProps {
  id: string;
  value: string;
  className?: string;
  onChange: (value: string) => void;
}

const partsFor = (value: string) => value.split(/({{[^}]+}})/g);

export const JinjaTemplateField = ({
  id,
  value,
  className = "h-32",
  onChange,
}: JinjaTemplateFieldProps) => {
  return (
    <div className="grid gap-2">
      <Textarea
        id={id}
        value={value}
        className={className}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
          onChange(e.target.value)
        }
      />
      <div className="whitespace-pre-wrap rounded-md border border-gray-300 bg-white p-3 font-mono text-sm leading-6">
        {partsFor(value).map((part, index) =>
          part.startsWith("{{") && part.endsWith("}}") ? (
            <span
              key={`${part}-${index}`}
              className="rounded bg-yellow-100 px-1 text-yellow-900"
            >
              {part}
            </span>
          ) : (
            <span key={`${part}-${index}`}>{part}</span>
          ),
        )}
      </div>
    </div>
  );
};
