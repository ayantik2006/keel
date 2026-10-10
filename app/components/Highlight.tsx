/** A word set on the brand orange block, in the display serif italic. */
export default function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-[#F2762E] px-2 font-display font-normal italic text-white">
      {children}
    </span>
  );
}
