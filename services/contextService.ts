
import { UserContextState } from '../types';

// The Context Service listens to GPS and Motion to determine what the user is doing.
// It uses "Adaptive Polling" to save battery.

let lastPosition: GeolocationPosition | null = null;
let lastTimestamp = 0;
let consecutiveHighSpeedCounts = 0;
let currentState: UserContextState = 'idle';
let motionHistory: number[] = [];

// Thresholds
const DRIVING_SPEED_KMPH = 25; // km/h
const WALKING_SPEED_KMPH = 3;
const RUNNING_SPEED_KMPH = 8;
const STILLNESS_THRESHOLD_MINUTES = 20;

export const startContextMonitoring = (onStateChange: (state: UserContextState) => void) => {
    if (!('geolocation' in navigator)) return;

    // 1. GPS Monitoring (Adaptive)
    const geoId = navigator.geolocation.watchPosition(
        (position) => {
            const now = Date.now();
            if (lastPosition) {
                const distKm = calculateDistance(
                    lastPosition.coords.latitude, 
                    lastPosition.coords.longitude,
                    position.coords.latitude,
                    position.coords.longitude
                );
                const timeDiffHours = (now - lastTimestamp) / 3600000;
                
                if (timeDiffHours > 0) {
                    const speedKmph = distKm / timeDiffHours;
                    determineStateFromSpeed(speedKmph, onStateChange);
                }
            }
            lastPosition = position;
            lastTimestamp = now;
        },
        (err) => console.warn("Context GPS Error", err),
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 }
    );

    // 2. Motion Monitoring (For Walking/Sleeping vs Driving)
    if (window.DeviceMotionEvent) {
        window.addEventListener('devicemotion', (event) => {
            if (event.acceleration) {
                const { x, y, z } = event.acceleration;
                const mag = Math.sqrt((x||0)**2 + (y||0)**2 + (z||0)**2);
                motionHistory.push(mag);
                if (motionHistory.length > 50) motionHistory.shift();
            }
        });
    }

    return () => navigator.geolocation.clearWatch(geoId);
};

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; 
};

const deg2rad = (deg: number) => deg * (Math.PI/180);

const determineStateFromSpeed = (speed: number, cb: (s: UserContextState) => void) => {
    let newState: UserContextState = currentState;

    // Check motion intensity (average of last few seconds)
    const avgMotion = motionHistory.length > 0 ? motionHistory.reduce((a,b)=>a+b,0)/motionHistory.length : 0;

    if (speed > DRIVING_SPEED_KMPH) {
        consecutiveHighSpeedCounts++;
        if (consecutiveHighSpeedCounts > 2) {
            newState = 'driving';
        }
    } else if (speed > RUNNING_SPEED_KMPH) {
        consecutiveHighSpeedCounts = 0;
        newState = 'running';
    } else if (speed > WALKING_SPEED_KMPH) {
        consecutiveHighSpeedCounts = 0;
        newState = 'walking';
    } else {
        consecutiveHighSpeedCounts = 0;
        // Low speed. Are we Idle or Sleeping?
        // If it's night time (checked in App logic) and avgMotion is near 0 for long, it's sleeping.
        // For now, we return idle.
        newState = 'idle';
    }

    if (newState !== currentState) {
        currentState = newState;
        cb(newState);
    }
};

export const getContextState = () => currentState;
