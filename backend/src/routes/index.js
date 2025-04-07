const express = require('express');
const router = express.Router();
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const travelPlanRoutes = require('./travel-plan.routes');
const aiRecommendationRoutes = require('./ai-recommendation.routes');
const aiRouteRoutes = require('./ai-route.routes');

// Ana rotalar
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/travel-plans', travelPlanRoutes);
router.use('/ai-recommendations', aiRecommendationRoutes);
router.use('/ai-route', aiRouteRoutes);

// API durumu
router.get('/status', (req, res) => {
  res.json({ status: 'API çalışıyor', version: '1.0.0' });
});

module.exports = router;
