/**
 * cityMiddleware.js — Multi-City Isolation Enforcement
 *
 * Two middleware functions:
 *  1. requireCity  — for client/captain routes. Reads req.user.city (set by
 *                    authMiddleware after DB lookup), attaches it as req.userCity,
 *                    and blocks any attempt to interact with a different city.
 *
 *  2. adminCityFilter — for admin routes. Does NOT enforce isolation (admins
 *                       see all cities), but validates and normalises the
 *                       optional ?city= query param into req.filterCity.
 *                       req.filterCity === null  → no filter (return all cities)
 *                       req.filterCity === 'Khartoum' | 'PortSudan' → filtered
 */

const VALID_CITIES = ['Khartoum', 'PortSudan'];

// ---------------------------------------------------------------------------
// requireCity — place AFTER `protect` on client / captain routes
// ---------------------------------------------------------------------------
const requireCity = (req, res, next) => {
    const userCity = req.user && req.user.city;

    // Safety: should never happen if authMiddleware is working, but guard anyway.
    if (!userCity) {
        return res.status(400).json({
            message: 'لم يتم تعيين مدينة لحسابك. يرجى التواصل مع الدعم الفني. (City not assigned to account)'
        });
    }

    // If the client sends a city field in the body, it MUST match their own city.
    // This blocks payload-spoofing attacks (e.g. a Khartoum user injecting city:'PortSudan').
    if (req.body.city && req.body.city !== userCity) {
        return res.status(403).json({
            message: `تعارض في المدينة: حسابك مسجل في ${userCity} ولا يمكنك التفاعل مع مدينة أخرى.`
        });
    }

    // Stamp req.userCity so route handlers don't have to read req.user.city themselves.
    req.userCity = userCity;
    next();
};

// ---------------------------------------------------------------------------
// adminCityFilter — place AFTER `protect` + `adminOnly` on admin routes
// ---------------------------------------------------------------------------
const adminCityFilter = (req, res, next) => {
    // Admin can pass ?city=Khartoum or ?city=PortSudan to filter views.
    // Passing no city means "show all cities" (req.filterCity = null).
    const requestedCity = req.query.city || req.body.city || null;

    if (requestedCity && !VALID_CITIES.includes(requestedCity)) {
        return res.status(400).json({
            message: `مدينة غير صحيحة. القيم المقبولة: ${VALID_CITIES.join(', ')}`
        });
    }

    req.filterCity = requestedCity || null;
    next();
};

module.exports = { requireCity, adminCityFilter, VALID_CITIES };
