const checkPermission = (permission) => {
  return (req, res, next) => {
    const user = req.user; // viene del auth middleware

    if (user.role === "doctor") {
      return next();
    }

    if (!user.permissions || user.permissions[permission] !== true) {
      return res.status(403).json({
        message: "No tienes permiso para realizar esta acción"
      });
    }

    next();
  };
};

module.exports = checkPermission