import CarModuleGate from './CarModuleGate';
import CarPlayer from './CarPlayer';

/** /car : lecteur voiture, derrière le module activable « Voiture ». */
export default function CarPlayerPage() {
  return (
    <CarModuleGate>
      <CarPlayer />
    </CarModuleGate>
  );
}
