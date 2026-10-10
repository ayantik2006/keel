const hatch: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(45deg, rgba(17,17,17,0.07) 0px, rgba(17,17,17,0.07) 1px, transparent 1px, transparent 7px)",
};

export default function SideRails() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 left-0 z-0 hidden w-[calc((100vw-72rem)/2)] border-r border-dashed border-border xl:block"
        style={hatch}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 right-0 z-0 hidden w-[calc((100vw-72rem)/2)] border-l border-dashed border-border xl:block"
        style={hatch}
      />
    </>
  );
}
