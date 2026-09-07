"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PartyStatus = exports.PartyType = void 0;
var PartyType;
(function (PartyType) {
    PartyType["INDIVIDUAL"] = "INDIVIDUAL";
    PartyType["ORGANIZATION"] = "ORGANIZATION";
})(PartyType || (exports.PartyType = PartyType = {}));
var PartyStatus;
(function (PartyStatus) {
    PartyStatus["ACTIVE"] = "ACTIVE";
    PartyStatus["SUSPENDED"] = "SUSPENDED";
    PartyStatus["TERMINATED"] = "TERMINATED";
})(PartyStatus || (exports.PartyStatus = PartyStatus = {}));
