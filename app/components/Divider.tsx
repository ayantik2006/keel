export default function Divider() {
  return (
    <div
      aria-hidden="true"
      className="h-2.5 w-full border-y border-border"
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, #E5E5E0 0px, #E5E5E0 1px, transparent 1px, transparent 7px)",
      }}
    />
  );
}
