/** Four 1px corner brackets, placed over the border of a relatively positioned parent. */
export function Corners() {
  const base = "pointer-events-none absolute h-2 w-2 border-muted";
  return (
    <>
      <span aria-hidden="true" className={`${base} -left-px -top-px border-l border-t`} />
      <span aria-hidden="true" className={`${base} -right-px -top-px border-r border-t`} />
      <span aria-hidden="true" className={`${base} -bottom-px -left-px border-b border-l`} />
      <span aria-hidden="true" className={`${base} -bottom-px -right-px border-b border-r`} />
    </>
  );
}
