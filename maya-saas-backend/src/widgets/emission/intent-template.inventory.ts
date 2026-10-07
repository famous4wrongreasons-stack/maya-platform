import { GOODS_RECEIPT_INTENT_TEMPLATE_REGISTRY } from '../inventory/goods-receipt-intent-template.registry';
import { INTENT_TEMPLATE_REGISTRY } from './intent-template.registry';
import { BOOKING_INTENT_TEMPLATE_REGISTRY } from '../booking/booking-intent-template.registry';
import { SERVICE_PRICE_INTENT_TEMPLATE_REGISTRY } from '../pricing/service-price-intent-template.registry';
import {
  SCHEDULE_INTENT_TEMPLATE,
  SCHEDULE_TEMPLATE,
} from './schedule-intent-template';

/** Complete finite identity for release binding, not a routing/registration API. */
export const INTENT_TEMPLATE_INVENTORY = Object.freeze({
  general: INTENT_TEMPLATE_REGISTRY,
  booking: BOOKING_INTENT_TEMPLATE_REGISTRY,
  servicePrice: SERVICE_PRICE_INTENT_TEMPLATE_REGISTRY,
  goodsReceipt: GOODS_RECEIPT_INTENT_TEMPLATE_REGISTRY,
  schedule: Object.freeze({ [SCHEDULE_TEMPLATE]: SCHEDULE_INTENT_TEMPLATE }),
});
