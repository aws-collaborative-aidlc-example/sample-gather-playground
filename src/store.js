export function createStore() {
  return {
    rooms: [
      { id: 'cedar', name: 'Cedar', capacity: 4, location: 'Ground floor', description: 'Small team. Big ideas.' },
      { id: 'maple', name: 'Maple', capacity: 8, location: 'First floor', description: 'A little more room to think.' },
      { id: 'aspen', name: 'Aspen', capacity: 12, location: 'First floor', description: 'Bring everyone together.' },
    ],
    bookings: [],
  };
}
