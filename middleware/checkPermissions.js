const checkPermission = (permission) => {
  return (req, res, next) => {
    const user = req.user; // viene del auth middleware

    if (user.role === "doctor") {
      return next();
    }

    if (!user.permissions || user.permissions[permission] !== true) {
      return res.status(403).json({
        message: "dashboard.patients.messages.errors.no_permission"
      });
    }

    next();
  };
};

module.exports = checkPermission