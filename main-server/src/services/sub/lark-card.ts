import { Subscribe } from "../../events";

export class LarkCardService {
    @Subscribe('card_create')
    handleCardCreate(data: any) {
        console.log('card_create', data);
    }

    @Subscribe('card_update_message')
    handleCardUpdate(data: any) {
        console.log('card_update', data);
    }

    @Subscribe('card_complete')
    handleCardComplete(data: any) {
        console.log('card_complete', data);
    }

    @Subscribe('card_fail')
    handleCardFail(data: any) {
        console.log('card_fail', data);
    }
}

