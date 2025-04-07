const AIRouteService = require('../services/ai-route.service');
const { catchAsync } = require('../utils/errorHandling');

class AIRouteController {
  constructor() {
    this.aiRouteService = new AIRouteService();
  }

  // Başlangıç ve bitiş noktaları arasında rota oluşturma
  createPointToPointRoute = catchAsync(async (req, res) => {
    const routeData = req.body;
    const userId = req.user.id;
    
    const route = await this.aiRouteService.generatePointToPointRoute(routeData, userId);
    
    res.status(201).json({
      success: true,
      data: route
    });
  });

  // Yakından uzağa sıralı rota oluşturma
  createProximityBasedRoute = catchAsync(async (req, res) => {
    const routeData = req.body;
    const userId = req.user.id;
    
    const route = await this.aiRouteService.generateProximityBasedRoute(routeData, userId);
    
    res.status(201).json({
      success: true,
      data: route
    });
  });

  // Rota üzerinde turistik yerleri bulma
  findAttractionsOnRoute = catchAsync(async (req, res) => {
    const { routeId } = req.params;
    const { interests, maxDetour } = req.query;
    
    const attractions = await this.aiRouteService.findAttractionsOnRoute(
      routeId, 
      interests ? interests.split(',') : [], 
      maxDetour || 5
    );
    
    res.status(200).json({
      success: true,
      data: attractions
    });
  });

  // Rota üzerinde yemek seçeneklerini bulma
  findFoodOptionsOnRoute = catchAsync(async (req, res) => {
    const { routeId } = req.params;
    const { cuisineTypes, maxDetour } = req.query;
    
    const foodOptions = await this.aiRouteService.findFoodOptionsOnRoute(
      routeId, 
      cuisineTypes ? cuisineTypes.split(',') : [], 
      maxDetour || 3
    );
    
    res.status(200).json({
      success: true,
      data: foodOptions
    });
  });

  // Rota üzerinde konaklama seçeneklerini bulma
  findAccommodationsOnRoute = catchAsync(async (req, res) => {
    const { routeId } = req.params;
    const { types, priceRange, maxDetour } = req.query;
    
    const accommodations = await this.aiRouteService.findAccommodationsOnRoute(
      routeId, 
      types ? types.split(',') : [], 
      priceRange,
      maxDetour || 5
    );
    
    res.status(200).json({
      success: true,
      data: accommodations
    });
  });
}

module.exports = new AIRouteController();
