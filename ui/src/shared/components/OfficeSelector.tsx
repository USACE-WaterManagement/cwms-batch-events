import { Dropdown } from "@usace/groundwork";

interface OfficeSelectorProps {
  offices: string[];
  value?: string;
  onChange: (office: string) => void;
}

export const OfficeSelector = ({
  offices,
  value,
  onChange,
}: OfficeSelectorProps) => {
  const sortedOffices = [...offices].sort();
  const hasSelectedOffice = !!value && sortedOffices.includes(value);
  const officeOptions = hasSelectedOffice
    ? [value, ...sortedOffices.filter((code) => code !== value)]
    : sortedOffices;

  return (
    <Dropdown
      key={`${value ?? ""}:${sortedOffices.join(",")}`}
      className="w-36"
      label="Office"
      value={value ?? ""}
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
        onChange(e.target.value);
      }}
      options={[
        !hasSelectedOffice && (
          <option key="" value="">
            Office...
          </option>
        ),
        ...officeOptions.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        )),
      ]}
    />
  );
};
