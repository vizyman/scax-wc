const DegToTABO = (degree: number): number => {
  const d = Number(degree);
  if (!Number.isFinite(d)) return 0;
  return (((180 - d) % 180) + 180) % 180;
}

export default DegToTABO;