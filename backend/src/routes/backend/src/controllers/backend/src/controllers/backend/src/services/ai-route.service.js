const axios = require('axios');
const TravelPlan = require('../models/travel-plan.model');
const TravelPoint = require('../models/travel-point.model');
const { AppError } = require('../utils/errorHandling');
const { optimizeRoute, calculateDistance } = require('../utils/routeOptimization');

class AIRouteService {
  constructor() {
    this.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.openAIApiKey = process.env.OPENAI_API_KEY;
  }

  // Başlangıç ve bitiş noktaları arasında rota oluşturma
  async generatePointToPointRoute(routeData, userId) {
    const {
      startLocation,
      endLocation,
      travelDays,
      transportationType,
      interests,
      includeFood,
      includeAccommodation
    } = routeData;

    // Google Maps Directions API ile rota oluştur
    const routeResponse = await this.getDirectionsFromGoogleMaps(
      startLocation,
      endLocation,
      transportationType
    );

    if (!routeResponse || !routeResponse.routes || routeResponse.routes.length === 0) {
      throw new AppError('Rota oluşturulamadı', 400);
    }

    const route = routeResponse.routes[0];
    
    // Rotayı günlere böl
    const dailySegments = this.splitRouteIntoDays(route, travelDays);
    
    // Her gün için turistik yerleri bul
    const enrichedSegments = await Promise.all(
      dailySegments.map(async (segment, index) => {
        // Turistik yerleri bul
        const attractions = await this.findNearbyAttractions(
          segment.startLocation,
          segment.endLocation,
          interests,
          5 // km cinsinden maksimum sapma
        );
        
        // Yemek seçeneklerini bul (eğer isteniyorsa)
        const foodOptions = includeFood 
          ? await this.findNearbyFoodOptions(segment.midPoint, 3)
          : [];
        
        // Konaklama seçeneklerini bul (eğer isteniyorsa ve son gün değilse)
        const accommodations = (includeAccommodation && index < dailySegments.length - 1)
          ? await this.findNearbyAccommodations(segment.endLocation, 5)
          : [];
        
        return {
          ...segment,
          dayNumber: index + 1,
          attractions,
          foodOptions,
          accommodations
        };
      })
    );
    
    // Seyahat planını veritabanına kaydet
    const travelPlan = await TravelPlan.create({
      userId,
      name: `${startLocation.name} - ${endLocation.name} Seyahati`,
      description: `${travelDays} günlük ${transportationType} seyahati`,
      startDate: new Date(),
      endDate: new Date(Date.now() + travelDays * 24 * 60 * 60 * 1000),
      transportationType,
      totalDistance: route.legs.reduce((total, leg) => total + leg.distance.value, 0) / 1000, // km cinsinden
      routeType: 'point-to-point'
    });
    
    // Günlük segmentleri ve noktaları kaydet
    for (const segment of enrichedSegments) {
      // Günlük rotayı kaydet
      const dayPlan = await TravelPoint.create({
        travelPlanId: travelPlan._id,
        name: `Gün ${segment.dayNumber}`,
        description: `${segment.startLocation.name} - ${segment.endLocation.name}`,
        dayNumber: segment.dayNumber,
        startLocation: segment.startLocation,
        endLocation: segment.endLocation,
        distance: segment.distance,
        duration: segment.duration
      });
      
      // Turistik yerleri kaydet
      for (const attraction of segment.attractions) {
        await TravelPoint.create({
          travelPlanId: travelPlan._id,
          parentPointId: dayPlan._id,
          name: attraction.name,
          description: attraction.description,
          type: 'attraction',
          location: attraction.location,
          dayNumber: segment.dayNumber
        });
      }
      
      // Yemek seçeneklerini kaydet
      for (const food of segment.foodOptions) {
        await TravelPoint.create({
          travelPlanId: travelPlan._id,
          parentPointId: dayPlan._id,
          name: food.name,
          description: food.description,
          type: 'food',
          location: food.location,
          dayNumber: segment.dayNumber
        });
      }
      
      // Konaklama seçeneklerini kaydet
      for (const accommodation of segment.accommodations) {
        await TravelPoint.create({
          travelPlanId: travelPlan._id,
          parentPointId: dayPlan._id,
          name: accommodation.name,
          description: accommodation.description,
          type: 'accommodation',
          location: accommodation.location,
          dayNumber: segment.dayNumber
        });
      }
    }
    
    // Oluşturulan seyahat planını döndür
    return {
      travelPlan,
      dailySegments: enrichedSegments
    };
  }

  // Yakından uzağa sıralı rota oluşturma
  async generateProximityBasedRoute(routeData, userId) {
    const {
      startLocation,
      travelDays,
      transportationType,
      interests,
      maxDistancePerDay,
      returnToStart,
      includeFood,
      includeAccommodation
    } = routeData;
    
    // Başlangıç noktası etrafındaki turistik yerleri bul
    const radius = this.calculateSearchRadius(transportationType, travelDays, maxDistancePerDay);
    const attractions = await this.findNearbyAttractions(
      startLocation,
      null, // bitiş noktası yok
      interests,
      radius
    );
    
    if (attractions.length === 0) {
      throw new AppError('Belirtilen kriterlere uygun turistik yer bulunamadı', 404);
    }
    
    // Turistik yerleri mesafeye göre sırala (yakından uzağa)
    attractions.sort((a, b) => a.distanceFromStart - b.distanceFromStart);
    
    // Günlük maksimum mesafeye göre günlere böl
    const defaultMaxDistance = {
      'walking': 10, // 10 km/gün yürüyüş
      'bicycle': 30, // 30 km/gün bisiklet
      'public': 50, // 50 km/gün toplu taşıma
      'car': 150 // 150 km/gün araba
    };
    
    const maxDistance = maxDistancePerDay || defaultMaxDistance[transportationType] || 50;
    
    // Günlere göre noktaları grupla
    const dailyAttractions = [];
    let currentDay = [];
    let currentDayDistance = 0;
    let previousPoint = startLocation;
    
    for (const attraction of attractions) {
      // Önceki noktadan bu noktaya olan mesafeyi hesapla
      const distanceToAttraction = calculateDistance(
        previousPoint.coordinates.lat,
        previousPoint.coordinates.lng,
        attraction.coordinates.lat,
        attraction.coordinates.lng
      );
      
      // Eğer günlük maksimum mesafeyi aşıyorsa, yeni güne geç
      if (currentDayDistance + distanceToAttraction > maxDistance) {
        if (currentDay.length > 0) {
          dailyAttractions.push([...currentDay]);
          currentDay = [];
          currentDayDistance = 0;
          previousPoint = startLocation; // Her gün başlangıç noktasından başla
        }
      }
      
      // Noktayı günlük rotaya ekle
      currentDay.push({
        ...attraction,
        distanceFromPrevious: distanceToAttraction
      });
      
      currentDayDistance += distanceToAttraction;
      previousPoint = {
        coordinates: {
          lat: attraction.coordinates.lat,
          lng: attraction.coordinates.lng
        }
      };
      
      // Eğer yeterli gün oluştuysa döngüden çık
      if (dailyAttractions.length >= travelDays - 1 && currentDay.length > 0) {
        dailyAttractions.push([...currentDay]);
        break;
      }
    }
    
    // Eğer son gün boş kaldıysa ekle
    if (currentDay.length > 0 && dailyAttractions.length < travelDays) {
      dailyAttractions.push([...currentDay]);
    }
    
    // Her gün için yemek ve konaklama seçeneklerini ekle
    const enrichedDays = await Promise.all(
      dailyAttractions.map(async (dayAttractions, index) => {
        // Günün orta noktasını bul
        const midPointIndex = Math.floor(dayAttractions.length / 2);
        const midPoint = dayAttractions[midPointIndex] || startLocation;
        
        // Günün son noktasını bul
        const endPoint = dayAttractions[dayAttractions.length - 1] || startLocation;
        
        // Yemek seçeneklerini bul
        const foodOptions = includeFood 
          ? await this.findNearbyFoodOptions(midPoint, 3)
          : [];
        
        // Konaklama seçeneklerini bul (son gün değilse)
        const accommodations = (includeAccommodation && index < dailyAttractions.length - 1)
          ? await this.findNearbyAccommodations(endPoint, 5)
          : [];
        
        return {
          dayNumber: index + 1,
          attractions: dayAttractions,
          foodOptions,
          accommodations,
          startPoint: startLocation,
          endPoint: returnToStart ? startLocation : endPoint
        };
      })
    );
    
    // Seyahat planını veritabanına kaydet
    const travelPlan = await TravelPlan.create({
      userId,
      name: `${startLocation.name} Keşif Seyahati`,
      description: `${travelDays} günlük ${transportationType} keşif seyahati`,
      startDate: new Date(),
      endDate: new Date(Date.now() + travelDays * 24 * 60 * 60 * 1000),
      transportationType,
      routeType: 'proximity-based'
    });
    
    // Günlük planları ve noktaları kaydet
    for (const day of enrichedDays) {
      // Günlük rotayı kaydet
      const dayPlan = await TravelPoint.create({
        travelPlanId: travelPlan._id,
        name: `Gün ${day.dayNumber}`,
        description: `${day.startPoint.name} bölgesi keşfi`,
        dayNumber: day.dayNumber,
        startLocation: day.startPoint,
        endLocation: day.endPoint
      });
      
      // Turistik yerleri kaydet
      for (const attraction of day.attractions) {
        await TravelPoint.create({
          travelPlanId: travelPlan._id,
          parentPointId: dayPlan._id,
          name: attraction.name,
          description: attraction.description,
          type: 'attraction',
          location: {
            coordinates: attraction.coordinates,
            name: attraction.name
          },
          dayNumber: day.dayNumber
        });
      }
      
      // Yemek seçeneklerini kaydet
      for (const food of day.foodOptions) {
        await TravelPoint.create({
          travelPlanId: travelPlan._id,
          parentPointId: dayPlan._id,
          name: food.name,
          description: food.description,
          type: 'food',
          location: food.location,
          dayNumber: day.dayNumber
        });
      }
      
      // Konaklama seçeneklerini kaydet
      for (const accommodation of day.accommodations) {
        await TravelPoint.create({
          travelPlanId: travelPlan._id,
          parentPointId: dayPlan._id,
          name: accommodation.name,
          description: accommodation.description,
          type: 'accommodation',
          location: accommodation.location,
          dayNumber: day.dayNumber
        });
      }
    }
    
    // Oluşturulan seyahat planını döndür
    return {
      travelPlan,
      dailyPlans: enrichedDays
    };
  }

  // Yardımcı metodlar
  async getDirectionsFromGoogleMaps(origin, destination, mode) {
    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
        params: {
          origin: `${origin.coordinates.lat},${origin.coordinates.lng}`,
          destination: `${destination.coordinates.lat},${destination.coordinates.lng}`,
          mode: this.mapTransportationTypeToGoogleMode(mode) ,
          key: this.googleMapsApiKey
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Google Maps API hatası:', error);
      throw new AppError('Rota bilgisi alınamadı', 500);
    }
  }
  
  mapTransportationTypeToGoogleMode(type) {
    const modeMap = {
      'walking': 'walking',
      'bicycle': 'bicycling',
      'public': 'transit',
      'car': 'driving'
    };
    
    return modeMap[type] || 'driving';
  }
  
  splitRouteIntoDays(route, days) {
    const segments = [];
    const totalDistance = route.legs.reduce((total, leg) => total + leg.distance.value, 0);
    const distancePerDay = totalDistance / days;
    
    let currentDayDistance = 0;
    let currentDaySegments = [];
    let dayStartLocation = {
      name: route.legs[0].start_address,
      coordinates: {
        lat: route.legs[0].start_location.lat,
        lng: route.legs[0].start_location.lng
      }
    };
    
    for (const leg of route.legs) {
      for (const step of leg.steps) {
        currentDaySegments.push(step);
        currentDayDistance += step.distance.value;
        
        if (currentDayDistance >= distancePerDay) {
          // Günün bitiş noktasını belirle
          const lastStep = currentDaySegments[currentDaySegments.length - 1];
          const dayEndLocation = {
            name: lastStep.end_address || 'Ara Nokta',
            coordinates: {
              lat: lastStep.end_location.lat,
              lng: lastStep.end_location.lng
            }
          };
          
          // Günün orta noktasını belirle
          const midPointIndex = Math.floor(currentDaySegments.length / 2);
          const midPointStep = currentDaySegments[midPointIndex];
          const dayMidPoint = {
            name: 'Günün Orta Noktası',
            coordinates: {
              lat: midPointStep.start_location.lat,
              lng: midPointStep.start_location.lng
            }
          };
          
          // Günlük segmenti ekle
          segments.push({
            startLocation: dayStartLocation,
            endLocation: dayEndLocation,
            midPoint: dayMidPoint,
            distance: currentDayDistance / 1000, // km cinsinden
            duration: currentDaySegments.reduce((total, step) => total + step.duration.value, 0) / 60, // dakika cinsinden
            segments: [...currentDaySegments]
          });
          
          // Yeni gün için değişkenleri sıfırla
          currentDaySegments = [];
          currentDayDistance = 0;
          dayStartLocation = dayEndLocation;
        }
      }
    }
    
    // Son günü ekle (eğer kalan segment varsa)
    if (currentDaySegments.length > 0) {
      const lastStep = currentDaySegments[currentDaySegments.length - 1];
      const dayEndLocation = {
        name: route.legs[route.legs.length - 1].end_address,
        coordinates: {
          lat: lastStep.end_location.lat,
          lng: lastStep.end_location.lng
        }
      };
      
      // Günün orta noktasını belirle
      const midPointIndex = Math.floor(currentDaySegments.length / 2);
      const midPointStep = currentDaySegments[midPointIndex] || currentDaySegments[0];
      const dayMidPoint = {
        name: 'Günün Orta Noktası',
        coordinates: {
          lat: midPointStep.start_location.lat,
          lng: midPointStep.start_location.lng
        }
      };
      
      segments.push({
        startLocation: dayStartLocation,
        endLocation: dayEndLocation,
        midPoint: dayMidPoint,
        distance: currentDayDistance / 1000, // km cinsinden
        duration: currentDaySegments.reduce((total, step) => total + step.duration.value, 0) / 60, // dakika cinsinden
        segments: [...currentDaySegments]
      });
    }
    
    return segments;
  }
  
  calculateSearchRadius(transportationType, days, maxDistancePerDay) {
    const defaultMaxDistance = {
      'walking': 10, // 10 km/gün yürüyüş
      'bicycle': 30, // 30 km/gün bisiklet
      'public': 50, // 50 km/gün toplu taşıma
      'car': 150 // 150 km/gün araba
    };
    
    const dailyDistance = maxDistancePerDay || defaultMaxDistance[transportationType] || 50;
    return dailyDistance * days;
  }
  
  // Diğer yardımcı metodlar...
}

module.exports = AIRouteService;
