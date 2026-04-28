const TABOToDeg = (TABOAngle: number): number => {
  const t = Number(TABOAngle);
  if (!Number.isFinite(t)) return 0;
  return (((180 - t) % 180) + 180) % 180;
}

export default TABOToDeg;