import CarModuleGate from '../streaming/car-player/CarModuleGate';
import CarLab from './CarLab';

/** /car/lab : labo voiture, derrière le module activable « Voiture ». */
export default function CarLabPage() {
  return (
    <CarModuleGate>
      <CarLab />
    </CarModuleGate>
  );
}
