import CarModuleGate from './CarModuleGate';
import CarProbe from './CarProbe';

/** /car/probe : diagnostic voiture, derrière le module activable « Voiture ». */
export default function CarProbePage() {
  return (
    <CarModuleGate>
      <CarProbe />
    </CarModuleGate>
  );
}
